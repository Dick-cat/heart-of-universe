'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { Conflict, ConflictAction, ExecutionTask } from '@/lib/types';
import { detectEvidenceConflicts, detectStepConflicts, detectConflictsWithAI, createManualConflict } from '@/lib/conflict-detection';
import { generateId } from '@/lib/graph-utils';

export function ConflictPanel() {
  const evidenceItems = useGraphStore((s) => s.evidenceItems);
  const threads = useGraphStore((s) => s.reasoningThreads);
  const executionTasks = useGraphStore((s) => s.executionTasks);
  const contentClusters = useGraphStore((s) => s.contentClusters);
  const globalReview = useGraphStore((s) => s.globalReview);
  const addExecutionTask = useGraphStore((s) => s.addExecutionTask);
  const updateExecutionTask = useGraphStore((s) => s.updateExecutionTask);
  const addChangeLogEntry = useGraphStore((s) => s.addChangeLogEntry);
  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);

  const [extraConflicts, setExtraConflicts] = useState<Conflict[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [manualA, setManualA] = useState('');
  const [manualB, setManualB] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const heuristic = useMemo(
    () => [...detectEvidenceConflicts(evidenceItems), ...threads.flatMap((t) => detectStepConflicts(t.steps))],
    [evidenceItems, threads]
  );

  const conflicts = useMemo(() => [...heuristic, ...extraConflicts], [heuristic, extraConflicts]);

  const runAI = async () => {
    setAiLoading(true);
    try {
      const allSteps = threads.flatMap((t) => t.steps);
      const ai = await detectConflictsWithAI(
        {
          evidenceItems,
          steps: allSteps,
          contentClusters,
          globalReview,
          executionTasks,
        },
        { provider: llmProvider, apiKey: llmApiKey, baseURL: llmBaseUrl, model: llmModel }
      );
      setExtraConflicts((prev) => [...prev, ...ai]);
    } catch (err: any) {
      alert('AI 冲突检测失败：' + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const addManual = () => {
    if (!manualA.trim() || !manualB.trim() || !manualDesc.trim()) return;
    setExtraConflicts((prev) => [...prev, createManualConflict(manualA.trim(), manualB.trim(), manualDesc.trim())]);
    setManualA('');
    setManualB('');
    setManualDesc('');
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const findTaskByIdOrTitle = (taskId?: string): ExecutionTask | undefined => {
    if (!taskId) return undefined;
    return executionTasks.find((t) => t.id === taskId || t.title === taskId);
  };

  const applyAction = (action: ConflictAction) => {
    if (action.actionType === 'create') {
      addExecutionTask({
        title: action.title,
        description: action.description,
        startDate: new Date().toISOString().slice(0, 16),
        endDate: action.dueHint ? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16) : undefined,
        importance: action.priority === 'high' ? 0.9 : action.priority === 'medium' ? 0.7 : 0.5,
        urgency: action.priority === 'high' ? 0.9 : action.priority === 'medium' ? 0.7 : 0.5,
        customMetrics: {},
        status: 'todo',
      });
      addChangeLogEntry({
        prompt: '冲突检测 AI 行动',
        summary: `根据冲突建议创建任务「${action.title}」`,
        nodesAdded: [],
        nodesUpdated: [],
        nodesRemoved: [],
        linksAdded: 0,
      });
      return;
    }

    const target = findTaskByIdOrTitle(action.taskId);
    if (!target) {
      alert('未找到对应任务，将创建新任务');
      applyAction({ ...action, actionType: 'create' });
      return;
    }

    let nextStatus: ExecutionTask['status'] = target.status;
    if (action.actionType === 'block') nextStatus = 'blocked';
    if (action.actionType === 'start') nextStatus = 'doing';
    if (action.actionType === 'update') {
      // Keep current status unless already done
      nextStatus = target.status === 'done' ? 'todo' : target.status;
    }

    updateExecutionTask(target.id, { status: nextStatus });
    addChangeLogEntry({
      prompt: '冲突检测 AI 行动',
      summary: `根据冲突建议将任务「${target.title}」状态更新为 ${statusLabel(nextStatus)}`,
      nodesAdded: [],
      nodesUpdated: [],
      nodesRemoved: [],
      linksAdded: 0,
    });
  };

  const severityColor = (s: string) => {
    const map: Record<string, string> = { high: 'text-crimson-400', medium: 'text-amber-400', low: 'text-cosmic-400' };
    return map[s] || 'text-cosmic-400';
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-2">
        <button
          onClick={runAI}
          disabled={aiLoading}
          className="flex-1 rounded-sm bg-crimson-700 py-1 text-[10px] text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
        >
          {aiLoading ? 'AI 检测中…' : 'AI 深度检测'}
        </button>
      </div>

      <div className="space-y-1 rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2">
        <div className="text-[10px] text-cosmic-500">手动标记冲突</div>
        <input
          value={manualA}
          onChange={(e) => setManualA(e.target.value)}
          placeholder="证据/步骤 A"
          className="cosmic-input w-full text-[10px]"
        />
        <input
          value={manualB}
          onChange={(e) => setManualB(e.target.value)}
          placeholder="证据/步骤 B"
          className="cosmic-input w-full text-[10px]"
        />
        <input
          value={manualDesc}
          onChange={(e) => setManualDesc(e.target.value)}
          placeholder="冲突描述"
          className="cosmic-input w-full text-[10px]"
        />
        <button onClick={addManual} className="w-full rounded-sm border border-cosmic-700 bg-cosmic-900/50 py-1 text-[10px] text-cosmic-300 hover:border-crimson-700">
          添加冲突
        </button>
      </div>

      {conflicts.length === 0 && <div className="text-cosmic-500">暂未检测到冲突</div>}
      {conflicts.map((c) => (
        <div key={c.id} className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2">
          <div className="flex items-center justify-between">
            <span className={severityColor(c.severity)}>
              {c.severity === 'high' ? '严重' : c.severity === 'medium' ? '中等' : '轻微'}
            </span>
            <span className="text-[10px] text-cosmic-500">
              {c.type === 'fact' ? '事实' : c.type === 'logic' ? '逻辑' : c.type === 'probability' ? '概率' : '来源'}
            </span>
          </div>
          <div className="mt-1 text-cosmic-300">{c.description}</div>
          <div className="mt-1 text-[10px] text-cosmic-500">
            {c.evidenceA} ↔ {c.evidenceB}
          </div>
          <ul className="mt-1 list-inside list-disc text-[10px] text-cosmic-500">
            {c.resolutionSuggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>

          {(c.suggestedActions?.length || 0) > 0 && (
            <div className="mt-2 border-t border-cosmic-800 pt-2">
              <button
                onClick={() => toggleExpanded(c.id)}
                className="text-[10px] text-crimson-400 hover:text-crimson-300"
              >
                {expandedIds.has(c.id) ? '收起行动' : '查看 AI 建议行动'}
              </button>
              {expandedIds.has(c.id) && (
                <div className="mt-2 space-y-2">
                  {c.suggestedActions?.map((action) => (
                    <div key={action.id} className="rounded-sm border border-cosmic-700 bg-cosmic-900/50 p-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-cosmic-200">{action.title}</span>
                        <span
                          className={`rounded-sm px-1.5 py-0.5 text-[10px] ${
                            action.priority === 'high'
                              ? 'bg-crimson-900/40 text-crimson-300'
                              : action.priority === 'medium'
                              ? 'bg-amber-900/40 text-amber-300'
                              : 'bg-cosmic-800 text-cosmic-400'
                          }`}
                        >
                          {action.priority === 'high' ? '高' : action.priority === 'medium' ? '中' : '低'}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-cosmic-500">{action.description}</div>
                      {action.dueHint && <div className="text-[10px] text-cosmic-500">建议：{action.dueHint}</div>}
                      <button
                        onClick={() => applyAction(action)}
                        className="mt-2 rounded-sm bg-crimson-700 px-2 py-0.5 text-[10px] text-white hover:bg-crimson-600"
                      >
                        {action.actionType === 'create'
                          ? '创建任务'
                          : action.actionType === 'block'
                          ? '标记阻塞'
                          : action.actionType === 'start'
                          ? '开始执行'
                          : '更新任务'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function statusLabel(status: ExecutionTask['status']): string {
  const map = { todo: '待办', doing: '进行中', done: '完成', blocked: '阻塞' };
  return map[status];
}
