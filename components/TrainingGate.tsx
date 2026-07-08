'use client';

import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { ContentItem } from '@/lib/types';
import { generateId } from '@/lib/graph-utils';
import {
  TrainingGateState,
  GateStatus,
  evaluateGate,
  computeScrollCoverage,
  computeRequiredReadSeconds,
  summaryQuality,
} from '@/lib/cognitive-training';
import { useAttentionTracker } from '@/hooks/useAttentionTracker';
import { useVisualSupervisor } from '@/hooks/useVisualSupervisor';
import { saveAttentionSession } from '@/lib/db';
import { flagToLabel } from '@/lib/attention';

interface TrainingGateProps {
  contentLength: number;
  aiExplanation: string;
  onApply: (grade: 'Ⅰ' | 'Ⅱ' | 'Ⅲ') => void;
  onCancel: () => void;
}

export function TrainingGate({ contentLength, aiExplanation, onApply, onCancel }: TrainingGateProps) {
  const config = useGraphStore((s) => s.cognitiveTraining);
  const addNode = useGraphStore((s) => s.addNode);
  const recordTrainingSummary = useGraphStore((s) => s.recordTrainingSummary);
  const recordTrainingManualNode = useGraphStore((s) => s.recordTrainingManualNode);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TrainingGateState>({
    startedAt: Date.now(),
    elapsedSeconds: 0,
    scrollCoverage: 0,
    summary: '',
    manualNodeCreated: false,
  });
  const [nodeLabel, setNodeLabel] = useState('');
  const [status, setStatus] = useState<GateStatus>({ canApply: false, missing: [], progress: 0 });

  const { getVisualFocusScore } = useVisualSupervisor();

  const { ref: attachAttention, session: attentionSession } = useAttentionTracker({
    contentId: `training-gate-${Date.now()}`,
    contentType: 'ai_output',
    contentLength,
    enabled: true,
    getVisualFocusScore,
    onSessionUpdate: (s) => {
      // Use attention flags to nudge user if needed
      if (s.flags.includes('tab_switched') || s.flags.includes('high_distraction')) {
        // Could show warning toast in future
      }
    },
  });

  const requiredSeconds = computeRequiredReadSeconds(contentLength, config.minReadSeconds);

  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => ({ ...prev, elapsedSeconds: Math.floor((Date.now() - prev.startedAt) / 1000) }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setStatus(evaluateGate(config, state, contentLength));
  }, [state, config, contentLength]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const coverage = computeScrollCoverage(el, el.scrollTop, el.clientHeight);
    setState((prev) => ({ ...prev, scrollCoverage: Math.max(prev.scrollCoverage, coverage) }));
  };

  const handleCreateNode = () => {
    const label = nodeLabel.trim() || '我的理解';
    const now = Date.now();
    const contentItem: ContentItem = {
      id: generateId('ci'),
      title: '我的思考摘要',
      titleEn: 'My Thinking Summary',
      content: state.summary.trim(),
      type: 'summary',
      tags: ['自主思考', 'self-summary'],
      createdAt: now,
      updatedAt: now,
    };
    addNode({
      label,
      type: 'note',
      description: state.summary.trim(),
      contentItems: [contentItem],
    });
    recordTrainingManualNode();
    setState((prev) => ({ ...prev, manualNodeCreated: true }));
    setNodeLabel('');
  };

  const handleApply = () => {
    if (!status.canApply) return;
    recordTrainingSummary();
    if (attentionSession) {
      saveAttentionSession(attentionSession).catch(() => {
        // ignore storage errors
      });
    }
    // Grade: Ⅲ requires both summary and a manual node; Ⅱ requires at least summary; Ⅰ fallback.
    const grade: 'Ⅰ' | 'Ⅱ' | 'Ⅲ' = state.manualNodeCreated ? 'Ⅲ' : state.summary.trim().length >= 10 ? 'Ⅱ' : 'Ⅰ';
    onApply(grade);
  };

  const quality = summaryQuality(state.summary);

  return (
    <div className="space-y-3 rounded-sm border border-crimson-900/50 bg-gradient-to-b from-crimson-950/30 to-cosmic-900/60 p-4 shadow-crimson-glow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-crimson-400">
          <span className="h-2 w-2 rotate-45 bg-current" />
          <span>认知训练闭环</span>
        </div>
        <button
          onClick={onCancel}
          className="rounded-sm px-2 py-1 text-xs text-cosmic-500 transition-colors hover:bg-cosmic-800 hover:text-cosmic-300"
        >
          取消
        </button>
      </div>

      <div className="text-xs leading-relaxed text-cosmic-400">
        你需要先阅读并思考，才能应用 AI 的完整输出。这是为了帮助你真正理解内容，而不是被动接受。
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-cosmic-500">
          <span>完成度</span>
          <span className={status.progress === 1 ? 'text-gold' : ''}>{Math.round(status.progress * 100)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-cosmic-800">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-crimson-600 to-gold transition-all"
            style={{ width: `${status.progress * 100}%` }}
          />
        </div>
      </div>

      {/* Attention monitor */}
      {attentionSession && (
        <div className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-cosmic-400">注意力监控</span>
            <span
              className={`font-bold ${
                attentionSession.score >= 0.8 ? 'text-emerald-400' : attentionSession.score >= 0.5 ? 'text-amber-400' : 'text-crimson-400'
              }`}
            >
              {Math.round(attentionSession.score * 100)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {attentionSession.flags.length === 0 && (
              <span className="rounded-sm bg-emerald-900/30 px-1.5 py-0.5 text-[10px] text-emerald-400">专注良好</span>
            )}
            {attentionSession.flags.map((flag, i) => (
              <span key={i} className="rounded-sm bg-crimson-900/30 px-1.5 py-0.5 text-[10px] text-crimson-300">
                {flagToLabel(flag)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI output with scroll tracking */}
      <div
        ref={(el) => {
          (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          attachAttention(el);
        }}
        onScroll={handleScroll}
        className="max-h-40 overflow-y-auto rounded-sm border border-cosmic-800 bg-cosmic-950/60 p-3 text-sm text-cosmic-300 scrollbar-thin"
      >
        {aiExplanation}
      </div>
      <div className="flex justify-between text-xs text-cosmic-500">
        <span>阅读进度：{Math.min(100, Math.round(state.scrollCoverage * 100))}%</span>
        <span>
          已读 {state.elapsedSeconds} / {requiredSeconds} 秒
        </span>
      </div>

      {/* Self summary */}
      {config.requireSelfSummary && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-cosmic-400">写下你的理解（至少 10 字）</label>
          <textarea
            value={state.summary}
            onChange={(e) => setState((prev) => ({ ...prev, summary: e.target.value }))}
            placeholder="用你自己的话概括刚才读到的内容…"
            className="cosmic-input h-20 w-full resize-none"
          />
          {state.summary.trim().length >= 10 && <div className="text-xs text-gold">{quality.feedback}</div>}
        </div>
      )}

      {/* Manual node */}
      {config.requireManualNode && (
        <div className="space-y-2 rounded-sm border border-cosmic-800 bg-panel-elevated p-3">
          <div className="text-xs font-medium text-cosmic-400">手动创建一个节点（把理解结构化）</div>
          {state.manualNodeCreated ? (
            <div className="text-xs text-gold">已创建节点</div>
          ) : (
            <>
              <input
                value={nodeLabel}
                onChange={(e) => setNodeLabel(e.target.value)}
                placeholder="节点名称（例如：核心结论）"
                className="cosmic-input w-full"
              />
              <button
                onClick={handleCreateNode}
                disabled={state.summary.trim().length < 10}
                className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-1.5 text-xs text-cosmic-200 transition-all disabled:opacity-50 hover:border-crimson-700 hover:bg-cosmic-700"
              >
                根据我的理解创建节点
              </button>
            </>
          )}
        </div>
      )}

      {/* Missing requirements */}
      {!status.canApply && status.missing.length > 0 && (
        <ul className="list-inside list-disc text-xs text-crimson-300">
          {status.missing.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {/* Apply button */}
      <button
        onClick={handleApply}
        disabled={!status.canApply}
        className="cosmic-btn-primary w-full disabled:opacity-50"
      >
        {status.canApply ? '我已理解，应用 AI 输出' : '请先完成上述训练步骤'}
      </button>
    </div>
  );
}
