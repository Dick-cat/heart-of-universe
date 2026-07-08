'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';

export function ChangeLogPanel() {
  const [open, setOpen] = useState(false);
  const changeLog = useGraphStore((s) => s.changeLog);
  const clearChangeLog = useGraphStore((s) => s.clearChangeLog);

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col items-start gap-2">
      {open && (
        <div className="flex h-[420px] w-[360px] flex-col rounded-none border border-cosmic-700 bg-cosmic-900/95 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-panel-border/60 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-crimson-400">LOG</span>
              <span className="font-bold tracking-wider text-cosmic-100">修改日志</span>
              <span className="rounded-full bg-cosmic-800 px-2 py-0.5 text-[10px] text-cosmic-500">{changeLog.length}</span>
            </div>
            <div className="flex items-center gap-2">
              {changeLog.length > 0 && (
                <button
                  onClick={clearChangeLog}
                  className="text-xs text-cosmic-500 transition-colors hover:text-crimson-400"
                >
                  清空
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-cosmic-800 hover:text-cosmic-100"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-4 scrollbar-thin">
            {changeLog.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-sm text-cosmic-500">
                <div className="mb-2 text-xs font-mono text-cosmic-600">LOG</div>
                暂无 AI 修改记录
                <div className="mt-1 text-xs">每次 AI 对话后会自动记录图谱变化</div>
              </div>
            )}

            {changeLog.map((entry) => (
              <div
                key={entry.id}
                className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3 text-sm"
              >
                <div className="mb-1 flex items-center justify-between text-xs text-cosmic-500">
                  <span>{new Date(entry.timestamp).toLocaleString('zh-CN')}</span>
                  <span className="rounded-full bg-cosmic-800 px-2 py-0.5 text-[10px] text-cosmic-400">
                    {entry.linksAdded > 0 || entry.nodesAdded.length > 0 ? '已应用' : '无结构变更'}
                  </span>
                </div>
                <div className="mb-2 line-clamp-2 text-xs text-cosmic-400" title={entry.prompt}>
                  {entry.prompt || '（无提示词）'}
                </div>
                <div className="mb-2 font-medium text-gold">{entry.summary}</div>
                <div className="space-y-1 text-xs text-cosmic-400">
                  {entry.nodesAdded.length > 0 && (
                    <div>
                      <span className="text-crimson-400">新增节点：</span>
                      {entry.nodesAdded.join('、')}
                    </div>
                  )}
                  {entry.nodesUpdated.length > 0 && (
                    <div>
                      <span className="text-crimson-400">更新节点：</span>
                      {entry.nodesUpdated.join('、')}
                    </div>
                  )}
                  {entry.nodesRemoved.length > 0 && (
                    <div>
                      <span className="text-crimson-400">移除节点：</span>
                      {entry.nodesRemoved.join('、')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-12 w-12 items-center justify-center rounded-none bg-cosmic-800 text-xl text-cosmic-200 shadow-lg transition-transform hover:scale-110 hover:bg-cosmic-700 hover:text-white active:scale-95"
        style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
        title="修改日志"
      >
        <span className="text-[10px] font-bold font-mono">LOG</span>
      </button>
    </div>
  );
}
