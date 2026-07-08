'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { GlobalReviewResult } from '@/lib/types';

type ReviewTab = 'overview' | 'review';

export function OverviewPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ReviewTab>('overview');

  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const executionTasks = useGraphStore((s) => s.executionTasks);
  const reasoningThreads = useGraphStore((s) => s.reasoningThreads);
  const overviewReport = useGraphStore((s) => s.overviewReport);
  const setOverviewReport = useGraphStore((s) => s.setOverviewReport);
  const globalReview = useGraphStore((s) => s.globalReview);
  const setGlobalReview = useGraphStore((s) => s.setGlobalReview);
  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [editingReview, setEditingReview] = useState(false);

  const buildProjectSnapshot = () => {
    const nodeSummary = nodes
      .map((n) => `- ${n.label} (${n.type})${n.description ? ': ' + n.description.slice(0, 80) : ''}`)
      .join('\n');
    const linkSummary = links
      .map((l) => {
        const s = nodes.find((n) => n.id === l.source)?.label || l.source;
        const t = nodes.find((n) => n.id === l.target)?.label || l.target;
        return `- ${s} → ${t}${l.label ? ` (${l.label})` : ''}`;
      })
      .join('\n');
    const taskSummary = executionTasks
      .map((t) => `- ${t.title} [${t.status}] (${new Date(t.startDate).toLocaleDateString()})`)
      .join('\n');
    const reasoningSummary = reasoningThreads
      .map((t) => `- ${t.title}: ${t.steps.map((s) => s.claim).join(' → ')}`)
      .join('\n');
    return { nodeSummary, linkSummary, taskSummary, reasoningSummary };
  };

  const generateOverview = async () => {
    setGenerating(true);
    setError('');
    try {
      const { nodeSummary, linkSummary, taskSummary, reasoningSummary } = buildProjectSnapshot();
      const prompt = `请根据以下项目数据，生成一份完整的中文综述报告（Markdown 格式）。报告应包含：
1. 研究背景与核心问题
2. 关键概念与原理梳理
3. 证据与推理链总结
4. 执行计划与落地方案
5. 当前空白与下一步建议

知识节点：
${nodeSummary || '无'}

关系网络：
${linkSummary || '无'}

执行任务：
${taskSummary || '无'}

推理线程：
${reasoningSummary || '无'}

请输出可直接阅读的 Markdown，标题层级清晰，内容具体可执行。`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a research synthesis assistant. Respond with Markdown in Chinese.' },
            { role: 'user', content: prompt },
          ],
          provider: llmProvider,
          apiKey: llmApiKey,
          baseURL: llmBaseUrl,
          model: llmModel,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setOverviewReport(json.content || '');
    } catch (err: any) {
      setError(err.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const generateReview = async () => {
    setGenerating(true);
    setError('');
    try {
      const { nodeSummary, linkSummary, taskSummary, reasoningSummary } = buildProjectSnapshot();
      const prompt = `请作为项目审查员，根据以下项目数据做一次全局审查。从结构完整性、证据充分性、逻辑一致性、覆盖广度、可执行性五个维度打分（0-10），并给出优势、问题与下一步建议。

知识节点：
${nodeSummary || '无'}

关系网络：
${linkSummary || '无'}

执行任务：
${taskSummary || '无'}

推理线程：
${reasoningSummary || '无'}

请严格返回 JSON：
{
  "summary": "一段总体评价",
  "score": 7.5,
  "strengths": ["优势1", "优势2"],
  "issues": ["问题1", "问题2"],
  "nextSteps": ["建议1", "建议2"],
  "dimensions": [
    { "name": "结构完整性", "score": 8, "comment": "..." },
    { "name": "证据充分性", "score": 6, "comment": "..." },
    { "name": "逻辑一致性", "score": 7, "comment": "..." },
    { "name": "覆盖广度", "score": 7, "comment": "..." },
    { "name": "可执行性", "score": 6, "comment": "..." }
  ]
}`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a rigorous project reviewer. Respond with valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          provider: llmProvider,
          apiKey: llmApiKey,
          baseURL: llmBaseUrl,
          model: llmModel,
          responseFormat: 'json_object',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const parsed = JSON.parse(json.content || '{}');
      const result: GlobalReviewResult = {
        summary: parsed.summary || '',
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setGlobalReview(result);
    } catch (err: any) {
      setError(err.message || '审查失败');
    } finally {
      setGenerating(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 8) return 'text-emerald-400';
    if (score >= 5) return 'text-amber-400';
    return 'text-crimson-400';
  };

  const scoreBg = (score: number) => {
    if (score >= 8) return 'bg-emerald-900/40';
    if (score >= 5) return 'bg-amber-900/40';
    return 'bg-crimson-900/40';
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`fixed right-4 top-96 z-40 flex h-10 w-10 items-center justify-center border border-cosmic-700 bg-cosmic-900/90 text-cosmic-200 shadow-lg backdrop-blur-xl transition-transform hover:scale-110 active:scale-95 ${
          open ? 'z-50' : 'z-40'
        }`}
        title="全局审查"
      >
        🌐
      </button>

      {open && (
        <div className="fixed right-16 top-96 z-50 w-[480px] rounded-sm border border-cosmic-700 bg-cosmic-900/95 p-4 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between border-b border-cosmic-800 pb-2">
            <span className="font-bold tracking-wider text-cosmic-100">全局审查</span>
            <button onClick={() => setOpen(false)} className="text-cosmic-400 hover:text-cosmic-100">
              ×
            </button>
          </div>

          <div className="mb-3 flex border-b border-cosmic-800">
            <button
              onClick={() => setTab('overview')}
              className={`flex-1 py-2 text-xs font-medium tracking-wider transition-colors ${
                tab === 'overview' ? 'border-b-2 border-crimson-500 text-cosmic-100' : 'text-cosmic-500 hover:text-cosmic-300'
              }`}
            >
              项目综述
            </button>
            <button
              onClick={() => setTab('review')}
              className={`flex-1 py-2 text-xs font-medium tracking-wider transition-colors ${
                tab === 'review' ? 'border-b-2 border-crimson-500 text-cosmic-100' : 'text-cosmic-500 hover:text-cosmic-300'
              }`}
            >
              全局审查
            </button>
          </div>

          {error && <div className="mb-2 rounded-sm bg-crimson-950/40 p-2 text-xs text-crimson-300">{error}</div>}

          {tab === 'overview' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={generateOverview}
                  disabled={generating}
                  className="flex-1 rounded-sm bg-crimson-700 py-1.5 text-xs text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
                >
                  {generating ? 'AI 生成中…' : 'AI 生成综述'}
                </button>
              </div>
              <textarea
                value={overviewReport}
                onChange={(e) => setOverviewReport(e.target.value)}
                placeholder="点击 AI 生成综述，或在此手动编辑 Markdown…"
                className="cosmic-input h-[55vh] w-full resize-none font-mono text-xs leading-relaxed"
              />
              <div className="text-[10px] text-cosmic-500">此综述会随项目一起保存和导出。</div>
            </div>
          )}

          {tab === 'review' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={generateReview}
                  disabled={generating}
                  className="flex-1 rounded-sm bg-crimson-700 py-1.5 text-xs text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
                >
                  {generating ? 'AI 审查中…' : 'AI 全局审查'}
                </button>
              </div>

              {!globalReview && !generating && (
                <div className="py-8 text-center text-sm text-cosmic-500">
                  点击上方按钮，AI 将从多个维度对项目进行全局审查。结果会随项目保存。
                </div>
              )}

              {globalReview && (
                <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-xs">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditingReview(!editingReview)}
                      className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-2 py-1 text-[10px] text-cosmic-300 hover:text-cosmic-100"
                    >
                      {editingReview ? '完成编辑' : '编辑'}
                    </button>
                    {editingReview && (
                      <button
                        onClick={() => {
                          setGlobalReview(null);
                          setEditingReview(false);
                        }}
                        className="rounded-sm border border-crimson-900/50 bg-crimson-950/30 px-2 py-1 text-[10px] text-crimson-400 hover:border-crimson-700"
                      >
                        清除
                      </button>
                    )}
                  </div>

                  <div className={`rounded-sm ${scoreBg(globalReview.score)} p-3`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-cosmic-500">综合评分</span>
                      {editingReview ? (
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={globalReview.score}
                          onChange={(e) =>
                            setGlobalReview({
                              ...globalReview,
                              score: parseFloat(e.target.value) || 0,
                              updatedAt: Date.now(),
                            })
                          }
                          className="w-20 cosmic-input text-xs"
                        />
                      ) : (
                        <span className={`text-lg font-bold ${scoreColor(globalReview.score)}`}>{globalReview.score.toFixed(1)}</span>
                      )}
                    </div>
                    {editingReview ? (
                      <textarea
                        value={globalReview.summary}
                        onChange={(e) => setGlobalReview({ ...globalReview, summary: e.target.value, updatedAt: Date.now() })}
                        className="mt-1 h-16 w-full cosmic-input text-xs"
                      />
                    ) : (
                      <div className="mt-1 text-cosmic-300">{globalReview.summary}</div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {globalReview.dimensions.map((d, idx) => (
                      <div key={d.name} className="rounded-sm border border-cosmic-700 bg-panel-elevated p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-cosmic-400">{d.name}</span>
                          {editingReview ? (
                            <input
                              type="number"
                              min={0}
                              max={10}
                              step={0.1}
                              value={d.score}
                              onChange={(e) => {
                                const next = [...globalReview.dimensions];
                                next[idx] = { ...d, score: parseFloat(e.target.value) || 0 };
                                setGlobalReview({ ...globalReview, dimensions: next, updatedAt: Date.now() });
                              }}
                              className="w-14 cosmic-input text-xs"
                            />
                          ) : (
                            <span className={`font-bold ${scoreColor(d.score)}`}>{d.score}</span>
                          )}
                        </div>
                        {editingReview ? (
                          <input
                            value={d.comment}
                            onChange={(e) => {
                              const next = [...globalReview.dimensions];
                              next[idx] = { ...d, comment: e.target.value };
                              setGlobalReview({ ...globalReview, dimensions: next, updatedAt: Date.now() });
                            }}
                            className="mt-1 w-full cosmic-input text-[10px]"
                          />
                        ) : (
                          <div className="mt-1 text-[10px] text-cosmic-500">{d.comment}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  <EditableList
                    title="优势"
                    titleColor="text-emerald-500"
                    items={globalReview.strengths}
                    editing={editingReview}
                    onChange={(items) => setGlobalReview({ ...globalReview, strengths: items, updatedAt: Date.now() })}
                  />
                  <EditableList
                    title="问题"
                    titleColor="text-crimson-500"
                    items={globalReview.issues}
                    editing={editingReview}
                    onChange={(items) => setGlobalReview({ ...globalReview, issues: items, updatedAt: Date.now() })}
                  />
                  <EditableList
                    title="下一步建议"
                    titleColor="text-cosmic-500"
                    items={globalReview.nextSteps}
                    ordered
                    editing={editingReview}
                    onChange={(items) => setGlobalReview({ ...globalReview, nextSteps: items, updatedAt: Date.now() })}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function EditableList({
  title,
  titleColor,
  items,
  editing,
  ordered = false,
  onChange,
}: {
  title: string;
  titleColor: string;
  items: string[];
  editing: boolean;
  ordered?: boolean;
  onChange: (items: string[]) => void;
}) {
  const ListTag = ordered ? 'ol' : 'ul';
  const listClass = ordered ? 'list-decimal' : 'list-disc';
  return (
    <div className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
      <div className={`mb-2 text-[10px] uppercase tracking-wider ${titleColor}`}>{title}</div>
      <ListTag className={`list-inside ${listClass} space-y-1 text-cosmic-300`}>
        {items.map((s, i) => (
          <li key={i} className="group flex items-start gap-2">
            {editing ? (
              <>
                <input
                  value={s}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = e.target.value;
                    onChange(next);
                  }}
                  className="flex-1 cosmic-input text-xs"
                />
                <button
                  onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                  className="text-crimson-400 hover:text-crimson-300"
                >
                  ×
                </button>
              </>
            ) : (
              <span>{s}</span>
            )}
          </li>
        ))}
      </ListTag>
      {editing && (
        <button
          onClick={() => onChange([...items, ''])}
          className="mt-2 rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-2 py-1 text-[10px] text-cosmic-300 hover:text-cosmic-100"
        >
          + 添加
        </button>
      )}
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 8) return 'text-emerald-400';
  if (score >= 5) return 'text-amber-400';
  return 'text-crimson-400';
}

function scoreBg(score: number) {
  if (score >= 8) return 'bg-emerald-900/40';
  if (score >= 5) return 'bg-amber-900/40';
  return 'bg-crimson-900/40';
}
