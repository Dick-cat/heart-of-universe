'use client';

import { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { InputTab } from './InputTab';
import { ExecutionTab } from './ExecutionTab';
import { LogicReasoningTab } from './LogicReasoningTab';

const TABS = [
  { id: 'input', label: '输入' },
  { id: 'execution', label: '时序/执行' },
  { id: 'reasoning', label: '逻辑推理' },
];

export function BottomConsole() {
  const [open, setOpen] = useState(true);
  const [height, setHeight] = useState(280);
  const [activeTab, setActiveTab] = useState('input');
  const resizingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = startYRef.current - e.clientY;
      const maxH = typeof window !== 'undefined' ? window.innerHeight - 96 : 600;
      const next = Math.max(160, Math.min(maxH, startHeightRef.current + delta));
      setHeight(next);
    };
    const onMouseUp = () => {
      resizingRef.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  };

  return (
    <div
      className="relative z-30 flex flex-col border-t border-cosmic-700 bg-cosmic-900/95 backdrop-blur-xl transition-all"
      style={{
        height: open ? height : 32,
        maxHeight: open ? 'calc(100vh - 96px)' : 32,
      }}
    >
      {/* Resize handle */}
      <div
        className="absolute -top-1 left-0 right-0 z-10 h-2 cursor-ns-resize bg-transparent hover:bg-crimson-500/20"
        onMouseDown={startResize}
      />

      {/* Header */}
      <div className="flex h-8 items-center justify-between border-b border-cosmic-800 bg-cosmic-950/40 px-3">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (!open) setOpen(true);
              }}
              className={`rounded-sm px-2 py-0.5 text-[10px] transition-colors ${
                activeTab === tab.id
                  ? 'bg-crimson-700 text-white'
                  : 'text-cosmic-400 hover:bg-cosmic-800 hover:text-cosmic-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-[10px] text-cosmic-400 hover:text-cosmic-200"
        >
          {open ? '收起' : '展开'}
        </button>
      </div>

      {open && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ContextBar activeTab={activeTab} onChangeTab={setActiveTab} />
          <div className="min-h-0 flex-1 overflow-auto p-3 pb-4">
            {activeTab === 'input' && <InputTab />}
            {activeTab === 'execution' && <ExecutionTab />}
            {activeTab === 'reasoning' && <LogicReasoningTab />}
          </div>
        </div>
      )}
    </div>
  );
}

function ContextBar({ activeTab, onChangeTab }: { activeTab: string; onChangeTab: (id: string) => void }) {
  const nodes = useGraphStore((s) => s.nodes);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const currentViewNodeId = useGraphStore((s) => s.currentViewNodeId);
  const contentClusters = useGraphStore((s) => s.contentClusters);
  const globalReview = useGraphStore((s) => s.globalReview);
  const executionTasks = useGraphStore((s) => s.executionTasks);
  const reasoningThreads = useGraphStore((s) => s.reasoningThreads);
  const nebulaMode = useGraphStore((s) => s.nebulaMode);
  const setWorkspace = useGraphStore((s) => s.setWorkspace);

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : undefined;
  const viewNode = currentViewNodeId ? nodes.find((n) => n.id === currentViewNodeId) : undefined;
  const activeCluster = contentClusters.length > 0
    ? (selectedNode
        ? contentClusters.find((c) => c.nodeIds.includes(selectedNode.id))
        : contentClusters.reduce((best, c) => (c.score ?? 0) > (best.score ?? 0) ? c : best, contentClusters[0]))
    : undefined;

  const doingCount = executionTasks.filter((t) => t.status === 'doing').length;
  const blockedCount = executionTasks.filter((t) => t.status === 'blocked').length;

  const switchToReasoning = () => {
    setWorkspace('graph');
    onChangeTab('reasoning');
  };

  const switchToExecution = () => {
    setWorkspace('graph');
    onChangeTab('execution');
  };

  return (
    <div className="flex items-center gap-2 border-b border-cosmic-800 bg-cosmic-950/40 px-3 py-1.5 text-[10px] text-cosmic-400">
      {selectedNode ? (
        <span className="rounded-sm border border-cosmic-700 bg-cosmic-900/50 px-1.5 py-0.5">
          节点：<span className="text-cosmic-200">{selectedNode.label}</span>
        </span>
      ) : viewNode ? (
        <span className="rounded-sm border border-cosmic-700 bg-cosmic-900/50 px-1.5 py-0.5">
          视图：<span className="text-cosmic-200">{viewNode.label}</span>
        </span>
      ) : (
        <span className="rounded-sm border border-cosmic-700 bg-cosmic-900/50 px-1.5 py-0.5">根视图</span>
      )}

      {selectedNode && (
        <>
          <button
            onClick={switchToReasoning}
            className="rounded-sm border border-crimson-900/50 bg-crimson-950/30 px-1.5 py-0.5 text-crimson-300 hover:bg-crimson-900/40"
          >
            推理
          </button>
          <button
            onClick={switchToExecution}
            className="rounded-sm border border-crimson-900/50 bg-crimson-950/30 px-1.5 py-0.5 text-crimson-300 hover:bg-crimson-900/40"
          >
            任务
          </button>
        </>
      )}

      {activeCluster && (
        <button
          onClick={() => {}}
          className="rounded-sm border border-cosmic-700 bg-cosmic-900/50 px-1.5 py-0.5"
          style={{ borderColor: activeCluster.color, color: activeCluster.color }}
        >
          区块：{activeCluster.label}
        </button>
      )}

      {nebulaMode && (
        <span className="rounded-sm border border-crimson-900/50 bg-crimson-950/30 px-1.5 py-0.5 text-crimson-300">
          星云视图
        </span>
      )}

      {globalReview && (
        <button
          onClick={() => onChangeTab('input')}
          className="rounded-sm border border-cosmic-700 bg-cosmic-900/50 px-1.5 py-0.5 hover:text-cosmic-200"
        >
          审查：<span className={globalReview.score >= 8 ? 'text-emerald-400' : globalReview.score >= 5 ? 'text-amber-400' : 'text-crimson-400'}>
            {globalReview.score.toFixed(1)}
          </span>
        </button>
      )}

      {reasoningThreads.length > 0 && (
        <button
          onClick={() => onChangeTab('reasoning')}
          className="rounded-sm border border-cosmic-700 bg-cosmic-900/50 px-1.5 py-0.5 hover:text-cosmic-200"
        >
          推理 {reasoningThreads.length}
        </button>
      )}

      <button
        onClick={() => onChangeTab('execution')}
        className="rounded-sm border border-cosmic-700 bg-cosmic-900/50 px-1.5 py-0.5 hover:text-cosmic-200"
      >
        执行 {doingCount > 0 && <span className="text-amber-400">进行中 {doingCount}</span>}
        {blockedCount > 0 && <span className="ml-1 text-crimson-400">阻塞 {blockedCount}</span>}
        {!doingCount && !blockedCount && <span>{executionTasks.length}</span>}
      </button>
    </div>
  );
}
