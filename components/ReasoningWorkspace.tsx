'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { ReasoningThread, ReasoningStep, InterventionCard, CounterfactualCard } from '@/lib/types';
import { generateId } from '@/lib/graph-utils';
import { ReasoningChain3D } from './ReasoningChain3D';

export function ReasoningWorkspace() {
  const threads = useGraphStore((s) => s.reasoningThreads);
  const addThread = useGraphStore((s) => s.addReasoningThread);
  const updateThread = useGraphStore((s) => s.updateReasoningThread);
  const deleteThread = useGraphStore((s) => s.deleteReasoningThread);
  const setWorkspace = useGraphStore((s) => s.setWorkspace);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threads[0]?.id || null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingIv, setEditingIv] = useState<{ stepId: string; idx: number } | null>(null);
  const [editingCf, setEditingCf] = useState<{ stepId: string; idx: number } | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  const updateStep = (stepId: string, patch: Partial<ReasoningStep>) => {
    if (!activeThread) return;
    updateThread(activeThread.id, {
      steps: activeThread.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    });
  };

  const addStep = () => {
    if (!activeThread) return;
    const id = generateId('step');
    updateThread(activeThread.id, {
      steps: [
        ...activeThread.steps,
        {
          id,
          claim: '新步骤',
          reasoning: '',
          evidenceIds: [],
          confidence: 'medium',
          suggestedEvidenceQuery: '',
          status: 'pending',
          interventions: [],
          counterfactuals: [],
        },
      ],
    });
    setEditingStepId(id);
    setEditingIv(null);
    setEditingCf(null);
  };

  const deleteStep = (stepId: string) => {
    if (!activeThread) return;
    if (!confirm('确定删除该推理步骤？')) return;
    updateThread(activeThread.id, {
      steps: activeThread.steps.filter((s) => s.id !== stepId),
    });
    if (editingStepId === stepId) setEditingStepId(null);
    if (editingIv?.stepId === stepId) setEditingIv(null);
    if (editingCf?.stepId === stepId) setEditingCf(null);
  };

  const addIntervention = (stepId: string) => {
    if (!activeThread) return;
    const step = activeThread.steps.find((s) => s.id === stepId);
    if (!step) return;
    const iv: InterventionCard = {
      id: generateId('iv'),
      variable: '',
      intervention: '',
      predictedOutcome: '',
      controlVariables: [],
      status: 'draft',
    };
    updateStep(stepId, { interventions: [...step.interventions, iv] });
    setEditingIv({ stepId, idx: step.interventions.length });
    setEditingStepId(null);
    setEditingCf(null);
  };

  const addCounterfactual = (stepId: string) => {
    if (!activeThread) return;
    const step = activeThread.steps.find((s) => s.id === stepId);
    if (!step) return;
    const cf: CounterfactualCard = {
      id: generateId('cf'),
      scenario: '',
      implication: '',
      boundaryCondition: '',
      vulnerability: '',
      status: 'draft',
    };
    updateStep(stepId, { counterfactuals: [...step.counterfactuals, cf] });
    setEditingCf({ stepId, idx: step.counterfactuals.length });
    setEditingStepId(null);
    setEditingIv(null);
  };

  const updateIntervention = (stepId: string, idx: number, patch: Partial<InterventionCard>) => {
    if (!activeThread) return;
    updateThread(activeThread.id, {
      steps: activeThread.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              interventions: s.interventions.map((iv, i) => (i === idx ? { ...iv, ...patch } : iv)),
            }
          : s
      ),
    });
  };

  const updateCounterfactual = (stepId: string, idx: number, patch: Partial<CounterfactualCard>) => {
    if (!activeThread) return;
    updateThread(activeThread.id, {
      steps: activeThread.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              counterfactuals: s.counterfactuals.map((cf, i) => (i === idx ? { ...cf, ...patch } : cf)),
            }
          : s
      ),
    });
  };

  const deleteIntervention = (stepId: string, idx: number) => {
    if (!activeThread) return;
    const step = activeThread.steps.find((s) => s.id === stepId);
    if (!step) return;
    if (!confirm('确定删除该干预卡片？')) return;
    updateStep(stepId, { interventions: step.interventions.filter((_, i) => i !== idx) });
    if (editingIv?.stepId === stepId && editingIv.idx === idx) setEditingIv(null);
  };

  const deleteCounterfactual = (stepId: string, idx: number) => {
    if (!activeThread) return;
    const step = activeThread.steps.find((s) => s.id === stepId);
    if (!step) return;
    if (!confirm('确定删除该反事实卡片？')) return;
    updateStep(stepId, { counterfactuals: step.counterfactuals.filter((_, i) => i !== idx) });
    if (editingCf?.stepId === stepId && editingCf.idx === idx) setEditingCf(null);
  };

  const activeStep = activeThread ? activeThread.steps.find((s) => s.id === editingStepId) : undefined;
  const activeIvCard = activeThread && editingIv
    ? activeThread.steps.find((s) => s.id === editingIv.stepId)?.interventions[editingIv.idx]
    : undefined;
  const activeCfCard = activeThread && editingCf
    ? activeThread.steps.find((s) => s.id === editingCf.stepId)?.counterfactuals[editingCf.idx]
    : undefined;

  return (
    <div className="flex flex-1 flex-col bg-cosmic-950 overflow-hidden">
      <div className="flex items-center justify-between border-b border-cosmic-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-wider text-cosmic-100">推理工作区</span>
          <button
            onClick={() => setWorkspace('graph')}
            className="rounded-sm border border-cosmic-700 bg-cosmic-900/80 px-2 py-1 text-[10px] text-cosmic-300 hover:border-crimson-600 hover:text-cosmic-100"
          >
            ← 返回知识图谱
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeThreadId || ''}
            onChange={(e) => {
              setActiveThreadId(e.target.value || null);
              setEditingStepId(null);
              setEditingIv(null);
              setEditingCf(null);
            }}
            className="cosmic-input h-8 text-xs"
          >
            <option value="">选择推理线程</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const id = addThread({
                title: '新推理线程',
                question: '',
                steps: [],
                activeLayer: 'association',
              });
              setActiveThreadId(id);
            }}
            className="rounded-sm bg-crimson-700 px-3 py-1 text-xs text-white hover:bg-crimson-600"
          >
            + 新建
          </button>
          {activeThreadId && (
            <button
              onClick={() => {
                if (confirm('确定删除当前推理线程？')) {
                  deleteThread(activeThreadId);
                  setActiveThreadId(threads[0]?.id || null);
                  setEditingStepId(null);
                  setEditingIv(null);
                  setEditingCf(null);
                }
              }}
              className="rounded-sm border border-crimson-900/50 bg-crimson-950/30 px-3 py-1 text-xs text-crimson-400 hover:border-crimson-700"
            >
              删除
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Thread list */}
        <div className="w-48 overflow-y-auto border-r border-cosmic-800 p-2 scrollbar-thin">
          {threads.length === 0 && <div className="text-xs text-cosmic-500">暂无推理线程</div>}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveThreadId(t.id);
                setEditingStepId(null);
                setEditingIv(null);
                setEditingCf(null);
              }}
              className={`mb-1 w-full rounded-sm px-2 py-1 text-left text-xs transition-colors ${
                activeThreadId === t.id ? 'bg-cosmic-700 text-cosmic-100' : 'text-cosmic-400 hover:bg-cosmic-800'
              }`}
            >
              <div className="truncate">{t.title}</div>
              <div className="text-[9px] text-cosmic-600">
                {t.steps.filter((s) => s.status === 'approved').length}/{t.steps.length} 采纳
              </div>
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="relative min-w-0 flex-1">
          {activeThread ? (
            <ReasoningChain3D
              thread={activeThread}
              large
              selectedId={
                editingStepId ||
                (editingIv ? `${editingIv.stepId}-iv-${editingIv.idx}` : null) ||
                (editingCf ? `${editingCf.stepId}-cf-${editingCf.idx}` : null)
              }
              onEditStep={(id) => {
                setEditingStepId(id);
                setEditingIv(null);
                setEditingCf(null);
              }}
              onEditIntervention={(stepId, idx) => {
                setEditingIv({ stepId, idx });
                setEditingStepId(null);
                setEditingCf(null);
              }}
              onEditCounterfactual={(stepId, idx) => {
                setEditingCf({ stepId, idx });
                setEditingStepId(null);
                setEditingIv(null);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-cosmic-500">选择一个推理线程开始</div>
          )}
        </div>

        {/* Editor panel */}
        <div className="w-80 overflow-y-auto border-l border-cosmic-800 p-3 scrollbar-thin">
          {!activeThread && <div className="text-xs text-cosmic-500">选择线程后编辑</div>}
          {activeThread && activeStep && (
            <StepEditor
              step={activeStep}
              onChange={(patch) => updateStep(activeStep.id, patch)}
              onDelete={() => deleteStep(activeStep.id)}
              onAddIntervention={() => addIntervention(activeStep.id)}
              onAddCounterfactual={() => addCounterfactual(activeStep.id)}
              onEditIntervention={(idx) => {
                setEditingIv({ stepId: activeStep.id, idx });
                setEditingStepId(null);
                setEditingCf(null);
              }}
              onEditCounterfactual={(idx) => {
                setEditingCf({ stepId: activeStep.id, idx });
                setEditingStepId(null);
                setEditingIv(null);
              }}
              onDeleteIntervention={(idx) => deleteIntervention(activeStep.id, idx)}
              onDeleteCounterfactual={(idx) => deleteCounterfactual(activeStep.id, idx)}
            />
          )}
          {activeThread && activeIvCard && editingIv && (
            <InterventionEditor
              card={activeIvCard}
              onChange={(patch) => updateIntervention(editingIv.stepId, editingIv.idx, patch)}
              onDelete={() => deleteIntervention(editingIv.stepId, editingIv.idx)}
              onBack={() => {
                setEditingIv(null);
                setEditingStepId(editingIv.stepId);
              }}
            />
          )}
          {activeThread && activeCfCard && editingCf && (
            <CounterfactualEditor
              card={activeCfCard}
              onChange={(patch) => updateCounterfactual(editingCf.stepId, editingCf.idx, patch)}
              onDelete={() => deleteCounterfactual(editingCf.stepId, editingCf.idx)}
              onBack={() => {
                setEditingCf(null);
                setEditingStepId(editingCf.stepId);
              }}
            />
          )}
          {activeThread && !activeStep && !activeIvCard && !activeCfCard && (
            <div className="space-y-3 text-xs">
              <div className="text-cosmic-500">点击画布中的节点进行编辑</div>
              <button
                onClick={addStep}
                className="w-full rounded-sm border border-dashed border-cosmic-600 py-2 text-xs text-cosmic-400 transition-colors hover:border-crimson-600 hover:text-cosmic-200"
              >
                + 添加推理步骤
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepEditor({
  step,
  onChange,
  onDelete,
  onAddIntervention,
  onAddCounterfactual,
  onEditIntervention,
  onEditCounterfactual,
  onDeleteIntervention,
  onDeleteCounterfactual,
}: {
  step: ReasoningStep;
  onChange: (patch: Partial<ReasoningStep>) => void;
  onDelete: () => void;
  onAddIntervention: () => void;
  onAddCounterfactual: () => void;
  onEditIntervention: (idx: number) => void;
  onEditCounterfactual: (idx: number) => void;
  onDeleteIntervention: (idx: number) => void;
  onDeleteCounterfactual: (idx: number) => void;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between border-b border-cosmic-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-crimson-900/40 px-2 py-0.5 text-[10px] text-crimson-300">推理步骤</span>
          <StatusBadge status={step.status} />
          <ConfidenceBadge confidence={step.confidence} />
        </div>
        <button onClick={onDelete} className="text-cosmic-500 hover:text-crimson-400" title="删除步骤">
          ×
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">论断</label>
        <textarea
          value={step.claim}
          onChange={(e) => onChange({ claim: e.target.value })}
          placeholder="具体、可检验的论断"
          className="cosmic-input h-20 w-full resize-none text-xs"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">推理过程</label>
        <textarea
          value={step.reasoning}
          onChange={(e) => onChange({ reasoning: e.target.value })}
          placeholder="从已知信息到论断的推导"
          className="cosmic-input h-24 w-full resize-none text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={step.status}
          onChange={(e) => onChange({ status: e.target.value as ReasoningStep['status'] })}
          className="cosmic-input w-full text-xs"
        >
          <option value="pending">待定</option>
          <option value="approved">采纳</option>
          <option value="rejected">忽略</option>
        </select>
        <select
          value={step.confidence}
          onChange={(e) => onChange({ confidence: e.target.value as ReasoningStep['confidence'] })}
          className="cosmic-input w-full text-xs"
        >
          <option value="high">高置信</option>
          <option value="medium">中置信</option>
          <option value="low">低置信</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">证据检索建议</label>
        <input
          value={step.suggestedEvidenceQuery || ''}
          onChange={(e) => onChange({ suggestedEvidenceQuery: e.target.value })}
          placeholder="英文关键词"
          className="cosmic-input w-full text-xs"
        />
      </div>

      {/* Interventions */}
      <div className="space-y-2 border-t border-cosmic-800 pt-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wider text-cosmic-500">干预卡片</label>
          <button onClick={onAddIntervention} className="text-[10px] text-crimson-400 hover:text-crimson-300">
            + 添加
          </button>
        </div>
        {step.interventions.length === 0 && <div className="text-cosmic-600">暂无干预</div>}
        {step.interventions.map((iv, idx) => (
          <div
            key={iv.id}
            className="group flex cursor-pointer items-center justify-between rounded-sm border border-cosmic-800 bg-cosmic-900/60 px-2 py-1.5 hover:border-cosmic-700"
            onClick={() => onEditIntervention(idx)}
          >
            <span className="truncate text-cosmic-300">
              do({iv.variable || '未命名'}) = {iv.intervention || '?'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteIntervention(idx);
              }}
              className="ml-2 text-cosmic-600 hover:text-crimson-400"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Counterfactuals */}
      <div className="space-y-2 border-t border-cosmic-800 pt-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wider text-cosmic-500">反事实卡片</label>
          <button onClick={onAddCounterfactual} className="text-[10px] text-crimson-400 hover:text-crimson-300">
            + 添加
          </button>
        </div>
        {step.counterfactuals.length === 0 && <div className="text-cosmic-600">暂无反事实</div>}
        {step.counterfactuals.map((cf, idx) => (
          <div
            key={cf.id}
            className="group flex cursor-pointer items-center justify-between rounded-sm border border-cosmic-800 bg-cosmic-900/60 px-2 py-1.5 hover:border-cosmic-700"
            onClick={() => onEditCounterfactual(idx)}
          >
            <span className="truncate text-cosmic-300">{cf.scenario || '未命名场景'}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCounterfactual(idx);
              }}
              className="ml-2 text-cosmic-600 hover:text-crimson-400"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InterventionEditor({
  card,
  onChange,
  onDelete,
  onBack,
}: {
  card: InterventionCard;
  onChange: (patch: Partial<InterventionCard>) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between border-b border-cosmic-800 pb-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-cosmic-500 hover:text-cosmic-300">
            ←
          </button>
          <span className="rounded-sm bg-amber-900/40 px-2 py-0.5 text-[10px] text-amber-300">干预</span>
          <StatusBadge status={card.status} />
        </div>
        <button onClick={onDelete} className="text-cosmic-500 hover:text-crimson-400" title="删除干预">
          ×
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">变量</label>
        <input
          value={card.variable}
          onChange={(e) => onChange({ variable: e.target.value })}
          placeholder="变量"
          className="cosmic-input w-full text-xs"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">干预值</label>
        <input
          value={card.intervention}
          onChange={(e) => onChange({ intervention: e.target.value })}
          placeholder="干预值"
          className="cosmic-input w-full text-xs"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">预测结果</label>
        <input
          value={card.predictedOutcome}
          onChange={(e) => onChange({ predictedOutcome: e.target.value })}
          placeholder="预测结果"
          className="cosmic-input w-full text-xs"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">控制变量</label>
        <input
          value={card.controlVariables.join(', ')}
          onChange={(e) => onChange({ controlVariables: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="逗号分隔"
          className="cosmic-input w-full text-xs"
        />
      </div>
      <select
        value={card.status}
        onChange={(e) => onChange({ status: e.target.value as InterventionCard['status'] })}
        className="cosmic-input w-full text-xs"
      >
        <option value="draft">草案</option>
        <option value="tested">已测试</option>
        <option value="confirmed">已确认</option>
        <option value="rejected">已拒绝</option>
      </select>
    </div>
  );
}

function CounterfactualEditor({
  card,
  onChange,
  onDelete,
  onBack,
}: {
  card: CounterfactualCard;
  onChange: (patch: Partial<CounterfactualCard>) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between border-b border-cosmic-800 pb-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-cosmic-500 hover:text-cosmic-300">
            ←
          </button>
          <span className="rounded-sm bg-violet-900/40 px-2 py-0.5 text-[10px] text-violet-300">反事实</span>
        </div>
        <button onClick={onDelete} className="text-cosmic-500 hover:text-crimson-400" title="删除反事实">
          ×
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">反事实场景</label>
        <input
          value={card.scenario}
          onChange={(e) => onChange({ scenario: e.target.value })}
          placeholder="如果…会怎样"
          className="cosmic-input w-full text-xs"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">推导后果</label>
        <input
          value={card.implication}
          onChange={(e) => onChange({ implication: e.target.value })}
          placeholder="推导后果"
          className="cosmic-input w-full text-xs"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">边界条件</label>
        <input
          value={card.boundaryCondition}
          onChange={(e) => onChange({ boundaryCondition: e.target.value })}
          placeholder="边界条件"
          className="cosmic-input w-full text-xs"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-cosmic-500">隐藏漏洞</label>
        <input
          value={card.vulnerability}
          onChange={(e) => onChange({ vulnerability: e.target.value })}
          placeholder="隐藏漏洞"
          className="cosmic-input w-full text-xs"
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; className: string }> = {
    pending: { text: '待定', className: 'bg-cosmic-700 text-cosmic-300' },
    approved: { text: '采纳', className: 'bg-emerald-900/40 text-emerald-300' },
    rejected: { text: '忽略', className: 'bg-crimson-900/40 text-crimson-300' },
    draft: { text: '草案', className: 'bg-cosmic-700 text-cosmic-300' },
    tested: { text: '已测试', className: 'bg-amber-900/40 text-amber-300' },
    confirmed: { text: '已确认', className: 'bg-emerald-900/40 text-emerald-300' },
  };
  const m = map[status] || { text: status, className: 'bg-cosmic-700 text-cosmic-300' };
  return <span className={`rounded-sm px-2 py-0.5 text-[10px] ${m.className}`}>{m.text}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, { text: string; className: string }> = {
    high: { text: '高置信', className: 'bg-emerald-900/40 text-emerald-300' },
    medium: { text: '中置信', className: 'bg-amber-900/40 text-amber-300' },
    low: { text: '低置信', className: 'bg-crimson-900/40 text-crimson-300' },
  };
  const m = map[confidence] || { text: confidence, className: 'bg-cosmic-700 text-cosmic-300' };
  return <span className={`rounded-sm px-2 py-0.5 text-[10px] ${m.className}`}>{m.text}</span>;
}
