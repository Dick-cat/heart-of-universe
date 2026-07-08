'use client';

import { useState, useMemo } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { AIGraphPayload, AutoDirection, AgentClusterResult, AutoReviewResult, AutoRound } from '@/lib/types';
import { buildProjectContext } from '@/lib/llm';
import {
  buildGenerationPrompt,
  buildReviewPrompt,
  buildExpansionPrompt,
  parseAgentClusterResult,
  parseReviewResult,
  normalizePayload,
  mergePayloads,
} from '@/lib/auto-generation';
import { TrainingGate } from './TrainingGate';
import { ENGINEERING_AGENT_PERSONAS } from '@/lib/agent-personas';
import { generateId } from '@/lib/graph-utils';

type Step = 'setup' | 'generating' | 'reviewing' | 'directions' | 'confirming';

export function AutoModePanel() {
  const [open, setOpen] = useState(false);

  const applyAIPayload = useGraphStore((s) => s.applyAIPayload);
  const recordTrainingInteraction = useGraphStore((s) => s.recordTrainingInteraction);
  const cognitiveTraining = useGraphStore((s) => s.cognitiveTraining);
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);

  const [theme, setTheme] = useState('');
  const [goal, setGoal] = useState('');
  const [count, setCount] = useState(10);

  const [step, setStep] = useState<Step>('setup');
  const [rounds, setRounds] = useState<AutoRound[]>([]);
  const [draftDirections, setDraftDirections] = useState<AutoDirection[]>([]);
  const [selectedDirIds, setSelectedDirIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showGate, setShowGate] = useState(false);

  const context = buildProjectContext(nodes, links, selectedNodeId);

  const mergedPayload = useMemo<AIGraphPayload>(() => {
    return rounds.reduce((acc, r) => mergePayloads(acc, r.payload), { explanation: '', nodes: [], links: [] } as AIGraphPayload);
  }, [rounds]);

  const callLLM = async (system: string, user: string) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        provider: llmProvider,
        apiKey: llmApiKey,
        baseURL: llmBaseUrl,
        model: llmModel,
        responseFormat: 'json_object',
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'LLM 请求失败');
    return json.content || '{}';
  };

  const startFirstRound = async () => {
    if (!theme.trim()) return alert('请先输入主题');
    setLoading(true);
    setError('');
    setStep('generating');
    setRounds([]);
    setDraftDirections([]);
    setSelectedDirIds([]);
    setShowGate(false);

    try {
      const { system, user } = buildGenerationPrompt(theme.trim(), goal.trim(), count, context);
      const content = await callLLM(system, user);
      const result = parseAgentClusterResult(content);
      const round: AutoRound = {
        round: 1,
        payload: normalizePayload(result.payload),
        consensus: result.consensus,
        opinions: result.opinions,
      };
      setRounds([round]);
      recordTrainingInteraction();
      await runReview(round, result);
    } catch (err: any) {
      setError(err.message || '生成失败');
      setStep('setup');
    } finally {
      setLoading(false);
    }
  };

  const runReview = async (round: AutoRound, clusterResult?: AgentClusterResult) => {
    setStep('reviewing');
    try {
      const { system, user } = buildReviewPrompt(round.payload, goal.trim() || theme.trim());
      const content = await callLLM(system, user);
      const review = parseReviewResult(content);
      const enrichedRound: AutoRound = { ...round, review };
      setRounds((prev) => {
        const next = [...prev];
        next[next.length - 1] = enrichedRound;
        return next;
      });
      const dirs = review.directions.length
        ? review.directions
        : [{ id: generateId('dir'), label: '继续深入主题', description: '基于当前节点进一步扩展' }];
      setDraftDirections(dirs);
      setSelectedDirIds(dirs.map((d) => d.id));
      setStep('directions');
    } catch (err: any) {
      setError(err.message || '审查失败');
      setStep('directions');
    }
  };

  const startNextRound = async () => {
    const selected = draftDirections.filter((d) => selectedDirIds.includes(d.id));
    if (selected.length === 0) return alert('请至少选择一个生成方向');
    setLoading(true);
    setError('');
    setStep('generating');

    try {
      const { system, user } = buildExpansionPrompt(theme.trim(), selected, mergedPayload, count);
      const content = await callLLM(system, user);
      const payload = normalizePayload(JSON.parse(content));
      const round: AutoRound = { round: rounds.length + 1, payload };
      const nextRounds = [...rounds, round];
      setRounds(nextRounds);
      recordTrainingInteraction();
      await runReview(round);
    } catch (err: any) {
      setError(err.message || '生成失败');
      setStep('directions');
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (showGate) return;
    if (cognitiveTraining.enabled) {
      setShowGate(true);
      return;
    }
    doApply('Ⅰ');
  };

  const doApply = (aiGrade?: import('@/lib/types').GraphNode['aiGrade']) => {
    if (mergedPayload.nodes.length === 0) return;
    applyAIPayload(mergedPayload, `自动模式：${theme.trim()}`, aiGrade);
    reset();
  };

  const reset = () => {
    setStep('setup');
    setRounds([]);
    setDraftDirections([]);
    setSelectedDirIds([]);
    setShowGate(false);
    setError('');
  };

  const updateDirection = (id: string, patch: Partial<AutoDirection>) => {
    setDraftDirections((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const addDirection = () => {
    const id = generateId('dir');
    setDraftDirections((prev) => [
      ...prev,
      { id, label: '新方向', description: '在此描述你希望深入的角度…' },
    ]);
    setSelectedDirIds((prev) => [...prev, id]);
  };

  const removeDirection = (id: string) => {
    setDraftDirections((prev) => prev.filter((d) => d.id !== id));
    setSelectedDirIds((prev) => prev.filter((x) => x !== id));
  };

  const removeCandidateNode = (nodeId: string) => {
    setRounds((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const filteredNodes = (last.payload.nodes || []).filter((n) => n.id !== nodeId);
      const filteredLinks = (last.payload.links || []).filter(
        (l) => l.source !== nodeId && l.target !== nodeId
      );
      const filteredScores = (last.review?.nodeScores || []).filter((n) => n.id !== nodeId);
      const next: AutoRound = {
        ...last,
        payload: { ...last.payload, nodes: filteredNodes, links: filteredLinks },
        review: last.review
          ? { ...last.review, nodeScores: filteredScores }
          : undefined,
      };
      return [...prev.slice(0, -1), next];
    });
  };

  const toggleDirection = (id: string) => {
    setSelectedDirIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const personaName = (id: string) => ENGINEERING_AGENT_PERSONAS.find((p) => p.id === id)?.name || id;
  const personaIcon = (id: string) => ENGINEERING_AGENT_PERSONAS.find((p) => p.id === id)?.icon || 'AG';

  const lastRound = rounds[rounds.length - 1];

  return (
    <>
      {open && (
        <div className="fixed right-16 top-[28rem] z-50 flex h-[600px] w-[480px] flex-col rounded-none border border-cosmic-700 bg-cosmic-900/95 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-panel-border/60 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-crimson-400">AUTO</span>
              <div>
                <div className="font-bold tracking-wider text-cosmic-100">自动模式</div>
                <div className="text-[10px] text-cosmic-500">多轮生成 · 可编辑方向</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-cosmic-800 hover:text-cosmic-100"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            {error && <div className="mb-3 rounded-sm bg-crimson-950/40 p-2 text-xs text-crimson-300">[错误] {error}</div>}

            {step === 'setup' && (
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-cosmic-500">主题</label>
                  <input
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    placeholder="例如：因果推断、系统架构设计…"
                    className="cosmic-input w-full text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-cosmic-500">目标</label>
                  <textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="希望解决什么问题、覆盖哪些层面…"
                    className="cosmic-input h-16 w-full resize-none text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-cosmic-500">每轮生成节点数</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={5}
                      max={30}
                      value={count}
                      onChange={(e) => setCount(parseInt(e.target.value, 10))}
                      className="flex-1"
                    />
                    <span className="w-8 text-right font-mono text-cosmic-300">{count}</span>
                  </div>
                </div>
                <button
                  onClick={startFirstRound}
                  disabled={loading || !theme.trim()}
                  className="cosmic-btn-primary w-full"
                >
                  {loading ? '生成中…' : '启动第一轮生成'}
                </button>
              </div>
            )}

            {step === 'generating' && (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-cosmic-400">
                <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-cosmic-600 border-t-crimson-500" />
                正在生成第 {rounds.length + 1} 轮节点…
              </div>
            )}

            {step === 'reviewing' && (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-cosmic-400">
                <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-cosmic-600 border-t-crimson-500" />
                审查员正在评估并推荐方向…
              </div>
            )}

            {/* Round summaries */}
            {rounds.length > 0 && step !== 'setup' && (
              <div className="mt-2 space-y-3 text-xs">
                {rounds.map((r, idx) => (
                  <div key={idx} className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-cosmic-500">第 {idx + 1} 轮</span>
                      <span className="text-cosmic-400">
                        {r.payload.nodes?.length || 0} 节点 · {r.payload.links?.length || 0} 关系
                      </span>
                    </div>
                    {idx === 0 && (r.consensus || r.review) && (
                      <>
                        <div className="mb-1 text-[10px] uppercase tracking-wider text-cosmic-500">Agent 集群共识</div>
                        <div className="mb-2 whitespace-pre-wrap text-cosmic-300">
                          {r.consensus || r.review?.summary || ''}
                        </div>
                      </>
                    )}
                    {r.review && idx > 0 && (
                      <div className="text-cosmic-400">{r.review.summary}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* First round agent opinions */}
            {lastRound?.round === 1 && step !== 'setup' && lastRound.opinions && (
              <div className="mt-3 space-y-2 text-xs">
                {lastRound.opinions
                  .filter((op): op is NonNullable<typeof op> => Boolean(op))
                  .map((op, idx) => (
                    <div key={idx} className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
                      <div className="mb-1 flex items-center gap-2 text-sm font-bold text-crimson-400">
                        <span>{personaIcon(op.personaId)}</span>
                        <span>{personaName(op.personaId)}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-xs leading-relaxed text-cosmic-300">{op.content}</div>
                    </div>
                  ))}
              </div>
            )}

            {/* Direction editing */}
            {step === 'directions' && lastRound && (
              <div className="mt-3 space-y-3 border-t border-cosmic-800 pt-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-cosmic-500">生成目标（后续轮次可编辑）</label>
                  <textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="修改后将在下一轮审查/生成时生效…"
                    className="cosmic-input h-16 w-full resize-none text-xs"
                  />
                </div>

                {lastRound.review && (
                  <div className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-wider text-cosmic-500">节点评分</div>
                    <div className="space-y-1">
                      {(lastRound.review.nodeScores || []).map((n) => (
                        <div key={n.id} className="flex items-center justify-between">
                          <span className="truncate text-cosmic-300">{n.label}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => removeCandidateNode(n.id)}
                              className="px-1 text-cosmic-500 hover:text-crimson-400"
                              title="删除该候选节点"
                            >
                              −
                            </button>
                            <span
                              className={`rounded-sm px-1.5 py-0.5 text-[10px] ${
                                n.score >= 8
                                  ? 'bg-emerald-900/40 text-emerald-300'
                                  : n.score >= 5
                                  ? 'bg-amber-900/40 text-amber-300'
                                  : 'bg-crimson-900/40 text-crimson-300'
                              }`}
                            >
                              {n.score}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-cosmic-500">下一轮生成方向（可编辑）</span>
                    <button onClick={addDirection} className="text-[10px] text-crimson-400 hover:text-crimson-300">
                      + 添加方向
                    </button>
                  </div>
                  {draftDirections.length === 0 && <div className="text-cosmic-600">暂无方向</div>}
                  {draftDirections.map((d) => {
                    const selected = selectedDirIds.includes(d.id);
                    return (
                      <div
                        key={d.id}
                        className={`rounded-sm border p-2 transition-colors ${
                          selected ? 'border-crimson-600 bg-crimson-950/20' : 'border-cosmic-700 bg-panel-elevated'
                        }`}
                      >
                        <div className="mb-2 flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleDirection(d.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 space-y-2">
                            <input
                              value={d.label}
                              onChange={(e) => updateDirection(d.id, { label: e.target.value })}
                              placeholder="方向标题"
                              className="w-full border-b border-cosmic-700 bg-transparent py-0.5 text-xs text-cosmic-200 focus:border-crimson-600 focus:outline-none"
                            />
                            <textarea
                              value={d.description}
                              onChange={(e) => updateDirection(d.id, { description: e.target.value })}
                              placeholder="描述该方向要解决什么问题、值得深入"
                              className="h-12 w-full resize-none border-b border-cosmic-700 bg-transparent py-0.5 text-[10px] text-cosmic-400 focus:border-crimson-600 focus:outline-none"
                            />
                          </div>
                          <button
                            onClick={() => removeDirection(d.id)}
                            className="text-cosmic-600 hover:text-crimson-400"
                            title="删除方向"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={startNextRound}
                    disabled={loading || selectedDirIds.length === 0}
                    className="cosmic-btn-primary flex-1"
                  >
                    {loading ? '生成中…' : '继续下一轮生成'}
                  </button>
                  <button
                    onClick={() => setStep('confirming')}
                    disabled={loading || mergedPayload.nodes.length === 0}
                    className="cosmic-btn-secondary flex-1"
                  >
                    完成并预览
                  </button>
                </div>
              </div>
            )}

            {/* Confirm / apply */}
            {step === 'confirming' && (
              <div className="mt-3 space-y-3 border-t border-cosmic-800 pt-3 text-xs">
                <div className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-cosmic-500">合并预览</div>
                  <div className="text-cosmic-300">
                    共 {rounds.length} 轮，总计 {mergedPayload.nodes?.length || 0} 个节点，{mergedPayload.links?.length || 0} 条关系
                  </div>
                </div>

                {showGate && (
                  <TrainingGate
                    contentLength={(mergedPayload.explanation || '').length}
                    aiExplanation={mergedPayload.explanation || 'AI 已生成节点，请阅读后应用。'}
                    onApply={doApply}
                    onCancel={() => setShowGate(false)}
                  />
                )}

                <div className="flex gap-2">
                  <button
                    onClick={apply}
                    disabled={showGate}
                    className="cosmic-btn-primary flex-1"
                  >
                    应用到知识图谱
                  </button>
                  <button onClick={() => setStep('directions')} className="cosmic-btn-secondary flex-1">
                    返回编辑方向
                  </button>
                  <button onClick={reset} className="cosmic-btn-secondary flex-1">
                    重新开始
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="fixed right-4 top-[28rem] z-50">
        <button
          onClick={() => setOpen(!open)}
          className="flex h-10 w-10 items-center justify-center border border-cosmic-700 bg-cosmic-900/90 text-cosmic-200 shadow-lg backdrop-blur-xl transition-transform hover:scale-110 active:scale-95"
          title="自动模式"
        >
          🤖
        </button>
      </div>
    </>
  );
}
