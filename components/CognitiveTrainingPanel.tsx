'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';

export function CognitiveTrainingPanel() {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const cognitiveTraining = useGraphStore((s) => s.cognitiveTraining);
  const setCognitiveTraining = useGraphStore((s) => s.setCognitiveTraining);
  const trainingSession = useGraphStore((s) => s.trainingSession);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`fixed right-4 top-80 z-40 flex h-10 w-10 items-center justify-center border border-cosmic-700 bg-cosmic-900/90 text-cosmic-200 shadow-lg backdrop-blur-xl transition-transform hover:scale-110 active:scale-95 ${
          open ? 'z-50' : 'z-40'
        }`}
        title="认知训练"
      >
        <span className={cognitiveTraining.enabled ? 'text-crimson-400' : 'text-cosmic-400'}>🧠</span>
      </button>

      {open && (
        <div className="fixed right-16 top-80 z-50 w-[340px] rounded-none border border-cosmic-700 bg-cosmic-900/95 p-4 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between border-b border-cosmic-800 pb-2">
            <span className="font-bold tracking-wider text-cosmic-100">认知训练</span>
            <button onClick={() => setOpen(false)} className="text-cosmic-400 hover:text-cosmic-100">
              ×
            </button>
          </div>

          <div className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 p-1">
            <button
              onClick={() => setCognitiveTraining({ enabled: !cognitiveTraining.enabled })}
              className={`flex w-full items-center justify-between rounded-sm px-4 py-2 text-xs font-medium transition-all ${
                cognitiveTraining.enabled
                  ? 'bg-crimson-600 text-white shadow-crimson-glow'
                  : 'text-cosmic-300 hover:text-cosmic-100'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rotate-45 bg-current" />
                <span>{cognitiveTraining.enabled ? '训练中' : '已关闭'}</span>
              </span>
              <span className={`h-2 w-2 rounded-full ${cognitiveTraining.enabled ? 'bg-gold' : 'bg-cosmic-600'}`} />
            </button>
          </div>

          {cognitiveTraining.enabled && (
            <div className="mt-3 space-y-3 rounded-sm border border-panel-border bg-panel-elevated p-3">
              <div className="flex justify-between text-xs text-cosmic-400">
                <span>交互 {trainingSession.totalAiInteractions}</span>
                <span>摘要 {trainingSession.selfSummaries}</span>
                <span>节点 {trainingSession.manualNodes}</span>
              </div>

              <button
                onClick={() => setShowSettings(!showSettings)}
                className="w-full rounded-sm border border-cosmic-700 bg-cosmic-900/60 py-1.5 text-xs text-cosmic-300 hover:border-crimson-700 hover:text-cosmic-100"
              >
                {showSettings ? '收起参数' : '训练参数'}
              </button>

              {showSettings && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="flex justify-between text-[10px] uppercase tracking-wider text-cosmic-400">
                      <span>最短阅读</span>
                      <span className="text-gold">{cognitiveTraining.minReadSeconds}s</span>
                    </label>
                    <input
                      type="range"
                      min={5}
                      max={300}
                      step={5}
                      value={cognitiveTraining.minReadSeconds}
                      onChange={(e) => setCognitiveTraining({ minReadSeconds: parseInt(e.target.value, 10) })}
                      className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-cosmic-700 accent-crimson-600"
                    />
                  </div>

                  <label className="flex items-center justify-between text-xs text-cosmic-300">
                    <span>要求摘要</span>
                    <input
                      type="checkbox"
                      checked={cognitiveTraining.requireSelfSummary}
                      onChange={(e) => setCognitiveTraining({ requireSelfSummary: e.target.checked })}
                      className="h-4 w-4 accent-crimson-600"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-cosmic-300">
                    <span>要求节点</span>
                    <input
                      type="checkbox"
                      checked={cognitiveTraining.requireManualNode}
                      onChange={(e) => setCognitiveTraining({ requireManualNode: e.target.checked })}
                      className="h-4 w-4 accent-crimson-600"
                    />
                  </label>

                  <button
                    onClick={() =>
                      setCognitiveTraining({
                        minReadSeconds: 30,
                        requireSelfSummary: true,
                        requireManualNode: true,
                      })
                    }
                    className="w-full rounded-sm border border-cosmic-700 py-1 text-[10px] text-cosmic-500 hover:text-cosmic-300"
                  >
                    恢复默认
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 text-[10px] leading-relaxed text-cosmic-500">
            训练目标：在采纳 AI 输出前，先完成自己的推理、摘要与手动节点。
          </div>
        </div>
      )}
    </>
  );
}
