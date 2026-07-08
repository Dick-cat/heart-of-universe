'use client';

import { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { AgentClusterResult, AIGraphPayload, ChatMessage } from '@/lib/types';
import { ENGINEERING_AGENT_PERSONAS, AGENT_CLUSTER_SYSTEM_PROMPT } from '@/lib/agent-personas';
import { TrainingGate } from './TrainingGate';

const PRESETS = [
  {
    label: '设计一个系统',
    prompt: '我要设计一个新的软件系统/工具，请从需求、架构、规划、风险、参考资料多角度给我建议。',
  },
  {
    label: '规划一个项目',
    prompt: '我要启动一个工程项目，请帮我拆分里程碑、识别关键任务与风险。',
  },
  {
    label: '改进现有方案',
    prompt: '请基于当前知识图谱中的主题，帮我审查现有方案并提出改进建议。',
  },
];

export function AgentClusterPanel() {
  const applyAIPayload = useGraphStore((s) => s.applyAIPayload);
  const recordTrainingInteraction = useGraphStore((s) => s.recordTrainingInteraction);
  const cognitiveTraining = useGraphStore((s) => s.cognitiveTraining);
  const customAgentPrompt = useGraphStore((s) => s.customAgentPrompt);
  const setCustomAgentPrompt = useGraphStore((s) => s.setCustomAgentPrompt);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentClusterResult | null>(null);
  const [error, setError] = useState('');
  const [showGate, setShowGate] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(customAgentPrompt || AGENT_CLUSTER_SYSTEM_PROMPT);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [result, error, showGate]);

  const runCluster = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    setShowGate(false);

    let userPrompt = input.trim();
    if (selectedNodeId) {
      const node = nodes.find((n) => n.id === selectedNodeId);
      if (node) {
        userPrompt += `\n\n当前上下文节点：${node.label}（${node.description || '无描述'}）`;
      }
    }

    const systemPrompt = customAgentPrompt || AGENT_CLUSTER_SYSTEM_PROMPT;
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '请求失败');

      const parsed = JSON.parse(json.content);
      const payload: AIGraphPayload = parsed.payload || { nodes: [], links: [] };
      const clusterResult: AgentClusterResult = {
        topic: parsed.topic || 'Agent 集群讨论',
        opinions: parsed.opinions || [],
        consensus: parsed.consensus || '',
        payload,
      };
      setResult(clusterResult);
      recordTrainingInteraction();
    } catch (err: any) {
      setError(err.message || '未知错误');
    } finally {
      setLoading(false);
    }
  };

  const applyResult = () => {
    if (!result) return;
    if (cognitiveTraining.enabled && !showGate) {
      setShowGate(true);
      return;
    }
    applyAIPayload(result.payload, `Agent集群：${input.trim()}`, cognitiveTraining.enabled ? 'Ⅱ' : 'Ⅰ');
    setResult(null);
    setShowGate(false);
    setInput('');
  };

  const handleGateApply = (grade: import('@/lib/types').GraphNode['aiGrade']) => {
    if (!result) return;
    applyAIPayload(result.payload, `Agent集群：${input.trim()}`, grade);
    setResult(null);
    setShowGate(false);
    setInput('');
  };

  const handleGateCancel = () => {
    setShowGate(false);
  };

  const applyPreset = (prompt: string) => {
    setInput(prompt);
  };

  const personaName = (id: string) => ENGINEERING_AGENT_PERSONAS.find((p) => p.id === id)?.name || id;
  const personaIcon = (id: string) => ENGINEERING_AGENT_PERSONAS.find((p) => p.id === id)?.icon || 'AG';

  const resultText = result
    ? [
        result.topic,
        ...result.opinions.map((o) => `${personaName(o.personaId)}：${o.content}`),
        `共识：${result.consensus}`,
      ].join('\n\n')
    : '';

  return (
    <div className="fixed bottom-4 right-20 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex h-[580px] w-[480px] flex-col rounded-none border border-cosmic-700 bg-cosmic-900/95 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-panel-border/60 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-crimson-400">AGENT</span>
              <div>
                <div className="font-bold tracking-wider text-cosmic-100">集群</div>
                <div className="text-[10px] text-cosmic-500">工程 · 架构 · 规划</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-cosmic-800 hover:text-cosmic-100"
            >
              ×
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-thin">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p.prompt)} className="cosmic-pill shrink-0">
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setShowPromptEditor(!showPromptEditor)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition-all ${
                customAgentPrompt
                  ? 'border border-amber-900/50 bg-amber-950/30 text-amber-400'
                  : 'border border-cosmic-700 bg-cosmic-800/60 text-cosmic-300 hover:border-crimson-700'
              }`}
            >
              {customAgentPrompt ? '已自定义' : '提示词'}
            </button>
          </div>

          {showPromptEditor && (
            <div className="mx-4 mb-2 space-y-2 rounded-sm border border-panel-border bg-panel-elevated p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-cosmic-300">Agent 集群系统提示词</span>
                <button
                  onClick={() => {
                    setCustomAgentPrompt(null);
                    setDraftPrompt(AGENT_CLUSTER_SYSTEM_PROMPT);
                  }}
                  className="text-xs text-cosmic-500 hover:text-crimson-400"
                >
                  恢复默认
                </button>
              </div>
              <textarea
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                className="cosmic-input h-40 w-full resize-none text-xs font-mono"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCustomAgentPrompt(draftPrompt.trim() || null);
                    setShowPromptEditor(false);
                  }}
                  className="cosmic-btn-primary flex-1 text-xs"
                >
                  保存
                </button>
                <button
                  onClick={() => {
                    setDraftPrompt(customAgentPrompt || AGENT_CLUSTER_SYSTEM_PROMPT);
                    setShowPromptEditor(false);
                  }}
                  className="cosmic-btn-secondary flex-1 text-xs"
                >
                  取消
                </button>
              </div>
              <div className="text-[10px] text-cosmic-500">提示：修改后下次启动 Agent 集群立即生效。</div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
            {error && <div className="rounded-sm bg-crimson-950/30 p-3 text-sm text-crimson-300">[错误] {error}</div>}

            {!result && !loading && !error && (
              <div className="text-sm text-cosmic-400">
                <p className="mb-3">输入工程或设计问题，5 位专家会分别给出建议并生成共识方案：</p>
                <ul className="list-inside list-disc space-y-2 text-xs">
                  {ENGINEERING_AGENT_PERSONAS.map((p) => (
                    <li key={p.id}>
                      <span className="mr-1 font-mono text-crimson-400">{p.icon}</span>
                      <b className="text-cosmic-200">{p.name}</b>
                      <span className="text-cosmic-500"> — {p.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-8 text-sm text-cosmic-400">
                <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-cosmic-600 border-t-crimson-500" />
                Agent 集群正在讨论…
                <div className="mt-2 text-xs text-cosmic-500">需求分析 → 架构设计 → 方案规划 → 风险评估 → 领域研究</div>
              </div>
            )}

            {result && (
              <div className="space-y-3">
                <div className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-cosmic-500">讨论主题</div>
                  <div className="font-medium text-cosmic-100">{result.topic}</div>
                </div>

                <div className="space-y-2">
                  {result.opinions.map((op, idx) => (
                    <div key={idx} className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
                      <div className="mb-1 flex items-center gap-2 text-sm font-bold text-crimson-400">
                        <span>{personaIcon(op.personaId)}</span>
                        <span>{personaName(op.personaId)}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-cosmic-300">{op.content}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-sm border border-gold/30 bg-gold/5 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-gold">共识总结</div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-cosmic-200">{result.consensus}</div>
                </div>

                <div className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-cosmic-500">生成节点</div>
                  <div className="text-sm text-cosmic-300">
                    {result.payload.nodes?.length || 0} 个节点，{result.payload.links?.length || 0} 条关系
                  </div>
                </div>

                {showGate && (
                  <TrainingGate
                    contentLength={resultText.length}
                    aiExplanation={resultText}
                    onApply={handleGateApply}
                    onCancel={handleGateCancel}
                  />
                )}
              </div>
            )}
          </div>

          <div className="border-t border-panel-border/60 p-4">
            {result ? (
              <div className="flex gap-2">
                <button
                  onClick={applyResult}
                  disabled={showGate}
                  className="cosmic-btn-primary flex-1"
                >
                  {cognitiveTraining.enabled && !showGate ? '进入训练闭环' : '应用到知识图谱'}
                </button>
                <button
                  onClick={() => {
                    setResult(null);
                    setShowGate(false);
                  }}
                  className="cosmic-btn-secondary flex-1"
                >
                  重新讨论
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !loading) {
                      e.preventDefault();
                      runCluster();
                    }
                  }}
                  placeholder="描述你的工程/设计/规划问题…"
                  className="cosmic-input h-20 w-full resize-none"
                />
                <button
                  onClick={runCluster}
                  disabled={loading || !input.trim()}
                  className="cosmic-btn-primary mt-3 w-full"
                >
                  {loading ? 'Agent 讨论中…' : '启动 Agent 集群'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-12 w-12 items-center justify-center rounded-none bg-gradient-to-br from-purple-600 to-purple-800 text-white shadow-[0_0_20px_rgba(147,51,234,0.35)] transition-transform hover:scale-110 active:scale-95"
        style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
      >
        <span className="text-[10px] font-bold font-mono">AGENT</span>
      </button>
    </div>
  );
}
