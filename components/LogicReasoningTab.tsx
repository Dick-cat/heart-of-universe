'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { ReasoningThread, ReasoningStep, ReasoningLayer, InterventionCard, CounterfactualCard, ReasoningDirection } from '@/lib/types';
import { callReasonLLM, buildReasonContext, threadFromOutput, ReasonOutput } from '@/lib/reasoning';
import { ReasoningChain3D } from './ReasoningChain3D';
import { PathFinder } from './PathFinder';
import { ConflictPanel } from './ConflictPanel';

type ToolView = 'threads' | 'path' | 'conflict';

export function LogicReasoningTab() {
  const threads = useGraphStore((s) => s.reasoningThreads);
  const addThread = useGraphStore((s) => s.addReasoningThread);
  const updateThread = useGraphStore((s) => s.updateReasoningThread);
  const deleteThread = useGraphStore((s) => s.deleteReasoningThread);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setNebulaMode = useGraphStore((s) => s.setNebulaMode);
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const contentClusters = useGraphStore((s) => s.contentClusters);
  const globalReview = useGraphStore((s) => s.globalReview);
  const executionTasks = useGraphStore((s) => s.executionTasks);
  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);

  const [toolView, setToolView] = useState<ToolView>('threads');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [question, setQuestion] = useState('');
  const [ownReasoning, setOwnReasoning] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [pendingOutput, setPendingOutput] = useState<ReasonOutput | null>(null);
  const [pendingDirections, setPendingDirections] = useState<ReasoningDirection[]>([]);
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);

  const activeThread = activeThreadId ? threads.find((t) => t.id === activeThreadId) : null;

  const startReasoning = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    try {
      const context = buildReasonContext({
        nodes,
        links,
        selectedNodeId,
        contentClusters,
        globalReview,
        executionTasks,
      });
      const output = await callReasonLLM(question.trim(), context, ownReasoning.trim(), {
        provider: llmProvider,
        apiKey: llmApiKey,
        baseURL: llmBaseUrl,
        model: llmModel,
      });
      setPendingOutput(output);
      setPendingDirections(output.directions);
      setSelectedDirectionId(output.directions[0]?.id || null);
    } catch (err: any) {
      setError(err.message || '推理失败');
    } finally {
      setLoading(false);
    }
  };

  const confirmDirection = () => {
    if (!pendingOutput || !selectedDirectionId) return;
    const contextNodeIds = selectedNodeId ? [selectedNodeId] : [];
    const contextClusterIds = selectedNodeId
      ? contentClusters.filter((c) => c.nodeIds.includes(selectedNodeId)).map((c) => c.id)
      : [];
    const threadData = threadFromOutput(question.trim(), pendingOutput, ownReasoning.trim(), {
      selectedNodeId,
      nodeIds: contextNodeIds,
      clusterIds: contextClusterIds,
      selectedDirectionId,
    });
    const id = addThread(threadData);
    setActiveThreadId(id);
    setToolView('threads');
    resetForm();
  };

  const resetForm = () => {
    setQuestion('');
    setOwnReasoning('');
    setPendingOutput(null);
    setPendingDirections([]);
    setSelectedDirectionId(null);
  };

  const setLayer = (layer: ReasoningLayer) => {
    if (!activeThread) return;
    updateThread(activeThread.id, { activeLayer: layer });
  };

  const setActiveStep = (stepId: string) => {
    if (!activeThread) return;
    updateThread(activeThread.id, { activeStepId: stepId });
  };

  const activeStep = activeThread?.steps.find((s) => s.id === activeThread.activeStepId) || activeThread?.steps[0];

  const selectedDirection = activeThread?.aiDirections?.find((d) => d.id === activeThread.selectedDirectionId);

  return (
    <div className="flex h-full flex-col">
      {error && <div className="mb-2 rounded-sm bg-crimson-950/40 p-2 text-xs text-crimson-300">{error}</div>}

      <div className="mb-2 flex gap-1 border-b border-cosmic-800 pb-2">
        {([
          { key: 'threads', label: '推理线程' },
          { key: 'path', label: '多跳导航' },
          { key: 'conflict', label: '冲突检测' },
        ] as { key: ToolView; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setToolView(t.key)}
            className={`rounded-sm px-2 py-1 text-[10px] transition-colors ${
              toolView === t.key ? 'bg-crimson-700 text-white' : 'text-cosmic-400 hover:bg-cosmic-800 hover:text-cosmic-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {toolView === 'path' && <PathFinder />}
      {toolView === 'conflict' && <ConflictPanel />}

      {toolView === 'threads' && !activeThread && !pendingOutput && (
        <div className="space-y-2">
          <div className="text-xs leading-relaxed text-cosmic-400">
            逻辑推理分三层：L1 关联观察、L2 干预检验、L3 反事实排查。AI 会读取当前节点、内容区块与全局审查记忆，给出多个推理方向供你选择或修改。
          </div>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="输入你想推理的问题…"
            className="cosmic-input w-full text-xs"
          />
          <textarea
            value={ownReasoning}
            onChange={(e) => setOwnReasoning(e.target.value)}
            placeholder="先写下你自己的推理（可选）…"
            className="cosmic-input h-16 w-full resize-none text-xs"
          />
          <button
            onClick={startReasoning}
            disabled={loading || !question.trim()}
            className="w-full rounded-sm bg-crimson-700 px-3 py-2 text-xs text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
          >
            {loading ? 'AI 推导中…' : '开始推理'}
          </button>

          {threads.length > 0 && (
            <div className="mt-2 border-t border-cosmic-800 pt-2">
              <div className="mb-1 text-[10px] text-cosmic-500">已有线程</div>
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveThreadId(t.id)}
                  className="mb-1 w-full rounded-sm bg-cosmic-900/50 px-2 py-1 text-left text-xs text-cosmic-300 hover:bg-cosmic-800"
                >
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {toolView === 'threads' && !activeThread && pendingOutput && (
        <div className="flex h-full flex-col space-y-2">
          <div className="text-xs font-medium text-cosmic-200">AI 推荐推理方向（可点击选择并修改）</div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {pendingDirections.map((d) => (
              <div
                key={d.id}
                onClick={() => setSelectedDirectionId(d.id)}
                className={`cursor-pointer rounded-sm border p-2 text-xs transition-colors ${
                  selectedDirectionId === d.id
                    ? 'border-crimson-600 bg-crimson-950/20'
                    : 'border-cosmic-800 bg-cosmic-950/40 hover:border-cosmic-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <input
                    value={d.label}
                    onChange={(e) =>
                      setPendingDirections((prev) =>
                        prev.map((item) => (item.id === d.id ? { ...item, label: e.target.value } : item))
                      )
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-transparent font-medium text-cosmic-100 outline-none"
                  />
                  {selectedDirectionId === d.id && <span className="text-crimson-400">✓</span>}
                </div>
                <textarea
                  value={d.description}
                  onChange={(e) =>
                    setPendingDirections((prev) =>
                      prev.map((item) => (item.id === d.id ? { ...item, description: e.target.value } : item))
                    )
                  }
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 h-12 w-full resize-none bg-transparent text-[10px] text-cosmic-400 outline-none"
                />
                <div className="mt-1 text-[10px] text-cosmic-500">影响：{d.estimatedImpact}</div>
                {d.risks.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.risks.map((r, i) => (
                      <span key={i} className="rounded-sm border border-cosmic-800 bg-cosmic-900/50 px-1.5 py-0.5 text-[10px] text-cosmic-500">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmDirection}
              disabled={!selectedDirectionId}
              className="flex-1 rounded-sm bg-crimson-700 px-3 py-2 text-xs text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
            >
              选定方向并生成线程
            </button>
            <button
              onClick={resetForm}
              className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-3 py-2 text-xs text-cosmic-300 hover:text-cosmic-100"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {toolView === 'threads' && activeThread && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between border-b border-cosmic-800 pb-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-cosmic-100">{activeThread.title}</div>
              {activeThread.contextNodeIds && activeThread.contextNodeIds.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-cosmic-500">
                  <span>来源：</span>
                  {activeThread.contextNodeIds.map((id) => {
                    const node = nodes.find((n) => n.id === id);
                    return node ? (
                      <button
                        key={id}
                        onClick={() => setSelectedNodeId(id)}
                        className="text-crimson-400 hover:underline"
                      >
                        {node.label}
                      </button>
                    ) : null;
                  })}
                  {activeThread.contextClusterIds?.map((id) => {
                    const cluster = contentClusters.find((c) => c.id === id);
                    return cluster ? (
                      <button
                        key={id}
                        onClick={() => setNebulaMode(true)}
                        className="hover:underline"
                        style={{ color: cluster.color }}
                      >
                        #{cluster.label}
                      </button>
                    ) : null;
                  })}
                  {globalReview && <span>审查 {globalReview.score.toFixed(1)}</span>}
                </div>
              )}
              {selectedDirection && (
                <div className="mt-1 text-[10px] text-cosmic-400">
                  已选方向：{selectedDirection.label}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setShowCanvas(!showCanvas)}
                className={`rounded-sm px-2 py-0.5 text-[10px] transition-colors ${
                  showCanvas ? 'bg-crimson-700 text-white' : 'border border-cosmic-700 bg-cosmic-800/60 text-cosmic-300 hover:border-crimson-700'
                }`}
              >
                {showCanvas ? '关闭画布' : '推理画布'}
              </button>
              <button
                onClick={() => setActiveThreadId(null)}
                className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-2 py-0.5 text-[10px] text-cosmic-300 hover:border-crimson-700"
              >
                返回
              </button>
            </div>
          </div>

          {showCanvas && (
            <div className="mb-2 h-48 rounded-sm border border-cosmic-800 bg-cosmic-950/40">
              <ReasoningChain3D
                thread={activeThread}
                onStepClick={(id) => {
                  setActiveStep(id);
                  setShowCanvas(false);
                }}
              />
            </div>
          )}

          <div className="mb-2 flex gap-1">
            {(['association', 'intervention', 'counterfactual'] as ReasoningLayer[]).map((l) => (
              <button
                key={l}
                onClick={() => setLayer(l)}
                className={`flex-1 rounded-sm py-1 text-[10px] transition-colors ${
                  activeThread.activeLayer === l
                    ? 'bg-crimson-700 text-white'
                    : 'border border-cosmic-700 bg-cosmic-900/50 text-cosmic-400 hover:text-cosmic-200'
                }`}
              >
                {layerLabel(l)}
              </button>
            ))}
          </div>

          <div className="mb-2 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {activeThread.steps.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveStep(s.id)}
                className={`shrink-0 rounded-sm px-2 py-1 text-[10px] transition-colors ${
                  activeStep?.id === s.id
                    ? 'bg-cosmic-700 text-cosmic-100'
                    : 'border border-cosmic-800 bg-cosmic-950/40 text-cosmic-500 hover:text-cosmic-300'
                }`}
              >
                {s.claim.slice(0, 20)}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {activeStep && (
              <StepDetail
                step={activeStep}
                layer={activeThread.activeLayer}
                onUpdate={(patch) =>
                  updateThread(activeThread.id, {
                    steps: activeThread.steps.map((s) => (s.id === activeStep.id ? { ...s, ...patch } : s)),
                  })
                }
                onAddIntervention={(card) =>
                  updateThread(activeThread.id, {
                    steps: activeThread.steps.map((s) =>
                      s.id === activeStep.id ? { ...s, interventions: [...s.interventions, card] } : s
                    ),
                  })
                }
                onAddCounterfactual={(card) =>
                  updateThread(activeThread.id, {
                    steps: activeThread.steps.map((s) =>
                      s.id === activeStep.id ? { ...s, counterfactuals: [...s.counterfactuals, card] } : s
                    ),
                  })
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StepDetail({
  step,
  layer,
  onUpdate,
  onAddIntervention,
  onAddCounterfactual,
}: {
  step: ReasoningStep;
  layer: ReasoningLayer;
  onUpdate: (patch: Partial<ReasoningStep>) => void;
  onAddIntervention: (card: InterventionCard) => void;
  onAddCounterfactual: (card: CounterfactualCard) => void;
}) {
  const [ivForm, setIvForm] = useState({ variable: '', intervention: '', predictedOutcome: '', controlVariables: '' });
  const [cfForm, setCfForm] = useState({ scenario: '', implication: '', boundaryCondition: '', vulnerability: '' });

  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2">
        <div className="mb-1 font-medium text-cosmic-100">{step.claim}</div>
        <div className="text-cosmic-400">{step.reasoning}</div>
      </div>

      {layer === 'association' && (
        <div className="space-y-2">
          <div className="text-[10px] text-cosmic-500">L1：审查论断与证据</div>
          <div className="flex gap-2">
            {(['approved', 'rejected', 'pending'] as const).map((s) => (
              <button
                key={s}
                onClick={() => onUpdate({ status: s })}
                className={`rounded-sm px-2 py-1 text-[10px] transition-colors ${
                  step.status === s ? 'bg-crimson-700 text-white' : 'border border-cosmic-700 bg-cosmic-900/50 text-cosmic-300'
                }`}
              >
                {s === 'approved' ? '采纳' : s === 'rejected' ? '忽略' : '待定'}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-cosmic-500">不确定性分布</label>
            <select
              value={step.uncertainty?.type || 'custom'}
              onChange={(e) =>
                onUpdate({
                  uncertainty: {
                    type: e.target.value as any,
                    params: {},
                    confidence: step.uncertainty?.confidence ?? 0.5,
                    notes: step.uncertainty?.notes,
                  },
                })
              }
              className="cosmic-input w-full text-xs"
            >
              <option value="normal">正态分布</option>
              <option value="uniform">均匀分布</option>
              <option value="beta">Beta 分布</option>
              <option value="custom">自定义</option>
            </select>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={step.uncertainty?.confidence ?? 0.5}
              onChange={(e) =>
                onUpdate({
                  uncertainty: {
                    ...(step.uncertainty || { type: 'custom', params: {} }),
                    confidence: parseFloat(e.target.value),
                  },
                })
              }
              className="w-full"
            />
            <div className="text-[10px] text-cosmic-500">置信度 {Math.round((step.uncertainty?.confidence ?? 0.5) * 100)}%</div>
          </div>
        </div>
      )}

      {layer === 'intervention' && (
        <div className="space-y-2">
          <div className="text-[10px] text-cosmic-500">L2：设计干预实验</div>
          {step.interventions.length === 0 && <div className="text-cosmic-600">暂无干预设计</div>}
          {step.interventions.map((iv) => (
            <div key={iv.id} className="rounded-sm border border-cosmic-800 bg-cosmic-900/50 p-2">
              <div className="text-cosmic-200">do({iv.variable} = {iv.intervention})</div>
              <div className="text-cosmic-500">预测：{iv.predictedOutcome}</div>
              <div className="text-cosmic-500">控制：{iv.controlVariables.join(', ')}</div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <input
              value={ivForm.variable}
              onChange={(e) => setIvForm({ ...ivForm, variable: e.target.value })}
              placeholder="变量"
              className="cosmic-input text-xs"
            />
            <input
              value={ivForm.intervention}
              onChange={(e) => setIvForm({ ...ivForm, intervention: e.target.value })}
              placeholder="干预值"
              className="cosmic-input text-xs"
            />
            <input
              value={ivForm.predictedOutcome}
              onChange={(e) => setIvForm({ ...ivForm, predictedOutcome: e.target.value })}
              placeholder="预测结果"
              className="cosmic-input text-xs"
            />
            <input
              value={ivForm.controlVariables}
              onChange={(e) => setIvForm({ ...ivForm, controlVariables: e.target.value })}
              placeholder="控制变量（逗号分隔）"
              className="cosmic-input text-xs"
            />
          </div>
          <button
            onClick={() => {
              if (!ivForm.variable || !ivForm.intervention) return;
              onAddIntervention({
                id: `iv-${Date.now()}`,
                variable: ivForm.variable,
                intervention: ivForm.intervention,
                predictedOutcome: ivForm.predictedOutcome,
                controlVariables: ivForm.controlVariables.split(',').map((s) => s.trim()).filter(Boolean),
                status: 'draft',
              });
              setIvForm({ variable: '', intervention: '', predictedOutcome: '', controlVariables: '' });
            }}
            className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-1 text-[10px] text-cosmic-300 hover:border-crimson-700"
          >
            添加干预设计
          </button>
        </div>
      )}

      {layer === 'counterfactual' && (
        <div className="space-y-2">
          <div className="text-[10px] text-cosmic-500">L3：反事实与边界条件</div>
          {step.counterfactuals.length === 0 && <div className="text-cosmic-600">暂无反事实场景</div>}
          {step.counterfactuals.map((cf) => (
            <div key={cf.id} className="rounded-sm border border-cosmic-800 bg-cosmic-900/50 p-2">
              <div className="text-cosmic-200">场景：{cf.scenario}</div>
              <div className="text-cosmic-500">后果：{cf.implication}</div>
              <div className="text-cosmic-500">边界：{cf.boundaryCondition}</div>
              <div className="text-cosmic-500">漏洞：{cf.vulnerability}</div>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-2">
            <input
              value={cfForm.scenario}
              onChange={(e) => setCfForm({ ...cfForm, scenario: e.target.value })}
              placeholder="反事实场景（如果当时没有 X…）"
              className="cosmic-input text-xs"
            />
            <input
              value={cfForm.implication}
              onChange={(e) => setCfForm({ ...cfForm, implication: e.target.value })}
              placeholder="推导后果"
              className="cosmic-input text-xs"
            />
            <input
              value={cfForm.boundaryCondition}
              onChange={(e) => setCfForm({ ...cfForm, boundaryCondition: e.target.value })}
              placeholder="边界条件"
              className="cosmic-input text-xs"
            />
            <input
              value={cfForm.vulnerability}
              onChange={(e) => setCfForm({ ...cfForm, vulnerability: e.target.value })}
              placeholder="隐藏漏洞"
              className="cosmic-input text-xs"
            />
          </div>
          <button
            onClick={() => {
              if (!cfForm.scenario) return;
              onAddCounterfactual({
                id: `cf-${Date.now()}`,
                scenario: cfForm.scenario,
                implication: cfForm.implication,
                boundaryCondition: cfForm.boundaryCondition,
                vulnerability: cfForm.vulnerability,
                status: 'draft',
              });
              setCfForm({ scenario: '', implication: '', boundaryCondition: '', vulnerability: '' });
            }}
            className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-1 text-[10px] text-cosmic-300 hover:border-crimson-700"
          >
            添加反事实场景
          </button>
        </div>
      )}
    </div>
  );
}

function layerLabel(layer: ReasoningLayer): string {
  const map = { association: 'L1 关联', intervention: 'L2 干预', counterfactual: 'L3 反事实' };
  return map[layer];
}
