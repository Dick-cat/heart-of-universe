'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { AcademicPaper, searchAcademicAll, searchOpenAlex, searchArxiv } from '@/lib/academic-search';
import { generateId } from '@/lib/graph-utils';

interface MatchInfo {
  inTitle: boolean;
  inAbstract: boolean;
  inAuthors: boolean;
  matchedTerms: string[];
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w\u4e00-\u9fa5]/g, ''))
    .filter((t) => t.length > 1);
}

function analyzeMatch(paper: AcademicPaper, query: string): MatchInfo {
  const terms = tokenize(query);
  const q = query.toLowerCase();
  const title = paper.title.toLowerCase();
  const abstract = paper.abstract.toLowerCase();
  const authors = paper.authors.join(' ').toLowerCase();
  const matchedTerms = terms.filter((t) => title.includes(t) || abstract.includes(t) || authors.includes(t));
  return {
    inTitle: terms.some((t) => title.includes(t)) || title.includes(q),
    inAbstract: terms.some((t) => abstract.includes(t)) || abstract.includes(q),
    inAuthors: terms.some((t) => authors.includes(t)) || authors.includes(q),
    matchedTerms: Array.from(new Set(matchedTerms)),
  };
}

function HighlightText({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        terms.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-crimson-700/50 px-0.5 text-cosmic-100">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function AcademicSearchPanelInner() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AcademicPaper[]>([]);
  const [error, setError] = useState('');
  const [source, setSource] = useState<'all' | 'openalex' | 'arxiv'>('all');
  const addNode = useGraphStore((s) => s.addNode);
  const addLink = useGraphStore((s) => s.addLink);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      let papers: AcademicPaper[] = [];
      if (source === 'all') papers = await searchAcademicAll({ query, limit: 10 });
      else if (source === 'openalex') papers = await searchOpenAlex({ query, limit: 10 });
      else papers = await searchArxiv({ query, limit: 10 });
      setResults(papers);
    } catch (err: any) {
      setError(err.message || '搜索失败');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const importAsNode = (paper: AcademicPaper) => {
    const nodeId = generateId('paper');
    const now = Date.now();
    addNode({
      id: nodeId,
      label: paper.title.slice(0, 80),
      labelEn: paper.titleEn,
      type: 'paper',
      description: paper.abstract.slice(0, 200),
      descriptionEn: paper.abstractEn?.slice(0, 200),
      contentItems: [
        {
          id: generateId('ci'),
          title: '摘要',
          titleEn: 'Abstract',
          content: paper.abstract,
          contentEn: paper.abstractEn,
          type: 'abstract',
          tags: ['学术文献', paper.source],
          sourceUrl: paper.externalUrl,
          createdAt: now,
          updatedAt: now,
        },
      ],
      attachments: [
        ...(paper.pdfUrl
          ? [{ id: generateId('att'), type: 'link' as const, name: 'PDF 全文', url: paper.pdfUrl, createdAt: now }]
          : []),
        { id: generateId('att'), type: 'link' as const, name: '来源页面', url: paper.externalUrl, createdAt: now },
      ],
      metadata: {
        source: paper.source,
        authors: paper.authors,
        tags: [paper.source, ...(paper.year ? [String(paper.year)] : [])],
        createdAt: now,
        updatedAt: now,
      },
    });
    if (selectedNodeId && selectedNodeId !== nodeId) {
      addLink({ source: selectedNodeId, target: nodeId, label: '引用/相关' });
    }
  };

  const terms = tokenize(query);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as any)}
          className="cosmic-input w-28 text-xs"
        >
          <option value="all">全部</option>
          <option value="openalex">OpenAlex</option>
          <option value="arxiv">arXiv</option>
        </select>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="输入关键词、标题、作者…"
          className="cosmic-input flex-1 text-xs"
        />
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="cosmic-btn-primary px-3 text-xs disabled:opacity-50"
        >
          {loading ? '…' : '搜索'}
        </button>
      </div>

      {error && <div className="mt-3 rounded-sm bg-crimson-900/30 px-3 py-2 text-xs text-crimson-300">{error}</div>}

      <div className="mt-3 flex-1 space-y-2 overflow-y-auto scrollbar-thin">
        {results.length === 0 && !loading && !error && (
          <div className="text-center text-xs text-cosmic-500 py-4">输入关键词搜索 OpenAlex / arXiv</div>
        )}
        {results.map((paper) => {
          const match = analyzeMatch(paper, query);
          return (
            <div
              key={paper.id}
              className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-3 transition-colors hover:border-cosmic-600"
            >
              <div className="mb-1 text-sm font-medium text-cosmic-100 line-clamp-2">
                <HighlightText text={paper.title} terms={terms} />
              </div>

              {/* Match tags */}
              <div className="mb-2 flex flex-wrap gap-1">
                {match.inTitle && (
                  <span className="rounded-sm bg-crimson-900/40 px-1.5 py-0.5 text-[10px] text-crimson-300">标题匹配</span>
                )}
                {match.inAbstract && (
                  <span className="rounded-sm bg-cosmic-800 px-1.5 py-0.5 text-[10px] text-cosmic-300">摘要匹配</span>
                )}
                {match.inAuthors && (
                  <span className="rounded-sm bg-cosmic-800 px-1.5 py-0.5 text-[10px] text-cosmic-300">作者匹配</span>
                )}
                {match.matchedTerms.length > 0 && (
                  <span className="rounded-sm bg-emerald-900/30 px-1.5 py-0.5 text-[10px] text-emerald-400">
                    命中：{match.matchedTerms.join('、')}
                  </span>
                )}
              </div>

              <div className="mb-2 text-[10px] text-cosmic-500">
                {paper.authors.slice(0, 3).join(', ')}
                {paper.authors.length > 3 && ' et al.'}
                {paper.year && ` · ${paper.year}`}
                {paper.citationCount !== undefined && ` · 被引 ${paper.citationCount}`}
                {paper.isOpenAccess && <span className="ml-2 text-emerald-500">OA</span>}
              </div>
              <p className="mb-3 text-xs leading-relaxed text-cosmic-400 line-clamp-3">
                <HighlightText text={paper.abstract} terms={terms} />
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => importAsNode(paper)}
                  className="rounded-sm bg-crimson-700/80 px-2 py-1 text-[10px] text-white transition-colors hover:bg-crimson-600"
                >
                  导入为节点
                </button>
                {paper.pdfUrl && (
                  <a
                    href={paper.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-sm border border-cosmic-700 px-2 py-1 text-[10px] text-cosmic-300 transition-colors hover:bg-cosmic-800"
                  >
                    打开 PDF
                  </a>
                )}
                <a
                  href={paper.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm border border-cosmic-700 px-2 py-1 text-[10px] text-cosmic-300 transition-colors hover:bg-cosmic-800"
                >
                  来源
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
