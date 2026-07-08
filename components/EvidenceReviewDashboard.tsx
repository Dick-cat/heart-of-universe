'use client';

import { useMemo, useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { GraphNode } from '@/lib/types';
import { reviewAttachment, evaluateNodeRigor, levelColor, levelText } from '@/lib/evidence-review';
import { runAIEvidenceReview, AIReviewIssue, AIReviewResult } from '@/lib/ai-evidence-review';

export function EvidenceReviewDashboard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIReviewResult | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'source_credibility' | 'methodology' | 'consistency' | 'completeness' | 'network_embedding'>('all');

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);

  const node = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId]);

  const history = useMemo(() => {
    if (nodes.length < 2) return undefined;
    return {
      averageContentLength:
        nodes.reduce((sum, n) => sum + (n.contentItems || []).reduce((s, ci) => s + (ci.content || '').length, 0), 0) / nodes.length,
      averageEvidenceCount: nodes.reduce((sum, n) => sum + (n.attachments || []).length, 0) / nodes.length,
      averageRelationCount:
        nodes.reduce((sum, n) => sum + links.filter((l) => l.source === n.id || l.target === n.id).length, 0) / nodes.length,
    };
  }, [nodes, links]);

  const rigor = useMemo(() => {
    if (!node) return null;
    return evaluateNodeRigor(node, links, history);
  }, [node, links, history]);

  const attachmentReviews = useMemo(() => {
    if (!node) return [];
    return (node.attachments || []).map((att) => ({ att, review: reviewAttachment(att) }));
  }, [node]);

  const relatedNodes = useMemo(() => {
    if (!node) return [];
    const ids = new Set<string>();
    links.forEach((l) => {
      if (l.source === node.id) ids.add(l.target as string);
      if (l.target === node.id) ids.add(l.source as string);
    });
    return nodes.filter((n) => ids.has(n.id));
  }, [node, links, nodes]);

  const descendantNodes = useMemo(() => {
    if (!node) return [];
    const result: GraphNode[] = [];
    const collect = (parentId: string) => {
      for (const n of nodes) {
        if (n.parentId === parentId) {
          result.push(n);
          collect(n.id);
        }
      }
    };
    collect(node.id);
    return result;
  }, [node, nodes]);

  const relatedLinks = useMemo(() => {
    if (!node) return [];
    return links.filter((l) => l.source === node.id || l.target === node.id);
  }, [node, links]);

  const runAIReview = async () => {
    if (!node) return;
    setLoading(true);
    setError('');
    try {
      const result = await runAIEvidenceReview({
        node,
        relatedNodes,
        relatedLinks,
        descendantNodes,
        llmSettings: {
          provider: llmProvider,
          apiKey: llmApiKey,
          baseURL: llmBaseUrl,
          model: llmModel,
        },
      });
      setAiResult(result as any);
    } catch (err: any) {
      setError(err.message || 'AI 审查失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredIssues = aiResult?.issues?.filter((issue: AIReviewIssue) => filter === 'all' || issue.dimension === filter) || [];

  const scoreColor = (score: number) => {
    if (score >= 0.8) return 'text-emerald-400';
    if (score >= 0.55) return 'text-amber-400';
    return 'text-crimson-400';
  };

  const severityBadge = (severity: string) => {
    const map: Record<string, string> = {
      critical: 'bg-crimson-600 text-white',
      major: 'bg-amber-600 text-white',
      minor: 'bg-cosmic-600 text-cosmic-100',
      suggestion: 'bg-cosmic-800 text-cosmic-300',
    };
    return map[severity] || map.minor;
  };

  const dimensionLabel = (d: string) => {
    const map: Record<string, string> = {
      source_credibility: '来源可信度',
      methodology: '方法论',
      consistency: '一致性',
      completeness: '完整度',
      network_embedding: '网络嵌入',
    };
    return map[d] || d;
  };

  return (
    <>
      {open && (
        <div className="fixed right-16 top-48 z-50 h-[600px] w-[420px] overflow-y-auto rounded-none border border-cosmic-700 bg-cosmic-900/95 p-4 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl scrollbar-thin">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-crimson-400">REVIEW</span>
              <span className="font-bold tracking-wider text-cosmic-100">证据审查仪表</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-cosmic-800 hover:text-cosmic-100"
            >
              ×
            </button>
          </div>

          {!node && (
            <div className="text-xs text-cosmic-500">选中一个节点以启动严格审查。</div>
          )}

          {node && (
            <div className="space-y-4">
              {/* Header */}
              <div className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-3">
                <div className="mb-1 text-sm font-bold text-cosmic-100">{node.label}</div>
                <div className="text-xs text-cosmic-500">{node.type}</div>
              </div>

              {/* Rigor score */}
              {rigor && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-cosmic-400">节点严谨度</span>
                    <span className={`text-lg font-bold ${scoreColor(rigor.score)}`}>
                      {Math.round(rigor.score * 100)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                    <div className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-1">
                      <div className="text-cosmic-200">{Math.round(rigor.contentScore * 100)}</div>
                      <div className="text-cosmic-500">内容</div>
                    </div>
                    <div className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-1">
                      <div className="text-cosmic-200">{Math.round(rigor.evidenceScore * 100)}</div>
                      <div className="text-cosmic-500">证据</div>
                    </div>
                    <div className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-1">
                      <div className="text-cosmic-200">{Math.round(rigor.relationScore * 100)}</div>
                      <div className="text-cosmic-500">关系</div>
                    </div>
                  </div>
                  {rigor.historyComparison && (
                    <div className="text-[10px] text-cosmic-500">
                      超过项目中 {rigor.historyComparison.percentile}% 的节点
                    </div>
                  )}
                  {rigor.suggestions.length > 0 && (
                    <ul className="list-inside list-disc text-[10px] text-amber-400">
                      {rigor.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Attachment credibility */}
              {attachmentReviews.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-cosmic-400">附件可信度</div>
                  {attachmentReviews.map(({ att, review }) => (
                    <div key={att.id} className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-xs text-cosmic-200" title={att.name}>
                          {att.name}
                        </span>
                        <span className={`ml-2 rounded-sm px-1.5 py-0.5 text-[10px] text-white ${levelColor(review.level)}`}>
                          {levelText(review.level)}
                        </span>
                      </div>
                      {review.warnings.length > 0 && (
                        <ul className="mt-1 list-inside list-disc text-[10px] text-crimson-300">
                          {review.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* AI Review */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-cosmic-400">AI 深度审查</span>
                  <button
                    onClick={runAIReview}
                    disabled={loading}
                    className="rounded-sm bg-crimson-700 px-2 py-1 text-[10px] text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
                  >
                    {loading ? '审查中…' : '运行 AI 审查'}
                  </button>
                </div>
                {error && <div className="text-xs text-crimson-300">{error}</div>}
                {aiResult && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2">
                      <span className="text-xs text-cosmic-400">AI 综合判定</span>
                      <span className={`text-sm font-bold ${scoreColor(aiResult.score)}`}>
                        {aiResult.verdict === 'trusted'
                          ? '可信'
                          : aiResult.verdict === 'questionable'
                          ? '存疑'
                          : aiResult.verdict === 'needs_review'
                          ? '需复核'
                          : '证据不足'}
                        {' · '}
                        {Math.round(aiResult.score * 100)}
                      </span>
                    </div>

                    {aiResult.strengths.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-medium text-emerald-400">优点</div>
                        <ul className="list-inside list-disc text-[10px] text-cosmic-300">
                          {aiResult.strengths.map((s: string, i: number) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-cosmic-400">问题清单</span>
                        <select
                          value={filter}
                          onChange={(e) => setFilter(e.target.value as any)}
                          className="cosmic-input w-24 py-0.5 text-[10px]"
                        >
                          <option value="all">全部</option>
                          <option value="source_credibility">来源</option>
                          <option value="methodology">方法</option>
                          <option value="consistency">一致</option>
                          <option value="completeness">完整</option>
                          <option value="network_embedding">嵌入</option>
                        </select>
                      </div>
                      {filteredIssues.length === 0 && (
                        <div className="text-[10px] text-cosmic-500">该维度下暂无问题。</div>
                      )}
                      {filteredIssues.map((issue: AIReviewIssue, i: number) => (
                        <div key={i} className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className={`rounded-sm px-1.5 py-0.5 text-[10px] ${severityBadge(issue.severity)}`}>
                              {issue.severity === 'critical'
                                ? '严重'
                                : issue.severity === 'major'
                                ? '重要'
                                : issue.severity === 'minor'
                                ? '次要'
                                : '建议'}
                            </span>
                            <span className="rounded-sm bg-cosmic-800 px-1.5 py-0.5 text-[10px] text-cosmic-300">
                              {dimensionLabel(issue.dimension)}
                            </span>
                            <span className="text-[10px] text-cosmic-500">{issue.location}</span>
                          </div>
                          <div className="mb-1 text-xs text-cosmic-200">{issue.description}</div>
                          <div className="mb-1 text-[10px] text-amber-400">建议：{issue.suggestion}</div>
                          <div className="text-[10px] text-cosmic-500">验证：{issue.howToVerify}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className={`fixed right-4 top-48 flex h-10 w-10 items-center justify-center rounded-none border border-cosmic-700 bg-cosmic-900/90 text-cosmic-200 shadow-lg backdrop-blur-xl transition-transform hover:scale-110 active:scale-95 ${
          open ? 'z-50' : 'z-40'
        }`}
        style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
        title="证据审查仪表"
      >
        <span className="text-lg">🔍</span>
      </button>
    </>
  );
}
