'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useGraphStore } from '@/hooks/useGraphStore';
import { useViewportData } from '@/hooks/useViewportData';
import { useClusteredGraph } from '@/hooks/useClusteredGraph';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useStartupRecovery } from '@/hooks/useStartupRecovery';
import { ChatPanel } from '@/components/ChatPanel';
import { LeftSidebar } from '@/components/LeftSidebar';
import { MultiSelectToolbar } from '@/components/MultiSelectToolbar';
import { ChangeLogPanel } from '@/components/ChangeLogPanel';
import { HeartClawLogo } from '@/components/HeartClawLogo';
import { AcademicToolsPanel } from '@/components/AcademicToolsPanel';
import { VisualSupervisionPanel } from '@/components/VisualSupervisionPanel';
import { EvidenceReviewDashboard } from '@/components/EvidenceReviewDashboard';
import { StickyNotesLayer } from '@/components/StickyNotesLayer';
import { ReasoningWorkspace } from '@/components/ReasoningWorkspace';
import { OverviewPanel } from '@/components/OverviewPanel';
import { AutoModePanel } from '@/components/AutoModePanel';
import { ContentClusterPanel } from '@/components/ContentClusterPanel';
import { ExecutionTab } from '@/components/ExecutionTab';

const Graph3D = dynamic(() => import('@/components/Graph3D'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-cosmic-400">
      <div className="text-center">
        <HeartClawLogo size={56} className="mx-auto mb-3 animate-pulse" />
        <div className="text-sm tracking-widest text-crimson-400">宇宙之心加载中…</div>
      </div>
    </div>
  ),
});

export default function Home() {
  useAutoSave();
  useKeyboardShortcuts();
  useStartupRecovery();

  const [leftOpen, setLeftOpen] = useState(true);
  const [cameraResetSignal, setCameraResetSignal] = useState(0);

  const workspace = useGraphStore((s) => s.workspace);

  const {
    nodes,
    links,
    currentViewNodeId,
    viewStack,
    viewMode,
    enterNodeView,
    exitNodeView,
    goToRootView,
    moveContentItemToNode,
  } = useGraphStore();
  const { visibleNodes, visibleLinks, currentNode } = useViewportData(currentViewNodeId);
  const { nodes: graphNodes, links: graphLinks, limited: graphLimited } = useClusteredGraph(
    visibleNodes,
    visibleLinks,
    viewMode
  );

  const handleNodeClick = (_id: string, _clickX?: number, _clickY?: number) => {
    // Graph3D already updates selectedNodeId and opens the sticky note for the main view.
  };

  const handleEnterView = (id: string) => {
    enterNodeView(id);
  };

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-cosmic font-sans">
      {/* Avant-garde ambient layer */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-32 top-0 h-[600px] w-[600px] bg-crimson-900/10 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] bg-gold/5 blur-[120px]" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="avant-grid" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M0 80L80 0" stroke="#dc2626" strokeWidth="0.5" />
              <path d="M0 0h80v80H0z" fill="none" stroke="#262626" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#avant-grid)" />
        </svg>
      </div>

      {/* Top avant-garde title bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex h-14 items-center justify-between px-4">
        {/* Left cluster: logo + title + accent slash */}
        <div className="pointer-events-auto flex items-center gap-0">
          <button
            onClick={() => setLeftOpen(!leftOpen)}
            className="flex h-10 w-10 items-center justify-center border border-cosmic-700 bg-cosmic-900/90 text-cosmic-200 shadow-crimson-glow backdrop-blur-md transition-all hover:border-crimson-600 hover:text-white"
            aria-label={leftOpen ? '收起左栏' : '展开左栏'}
          >
            {leftOpen ? '‹' : '›'}
          </button>
          <div className="hidden h-10 items-center gap-2 border-y border-crimson-900/50 bg-cosmic-900/90 pl-3 pr-5 backdrop-blur-md md:flex">
            <HeartClawLogo size={24} />
            <span className="cosmic-title text-sm font-bold tracking-[0.2em]">宇宙之心</span>
            <span className="text-[10px] font-mono text-crimson-400">v1.8.4</span>
          </div>
          <div className="hidden h-10 w-3 skew-x-[-12deg] border-y border-r border-crimson-900/50 bg-gradient-to-r from-crimson-900/30 to-transparent md:block" />
        </div>

      </div>

      {/* Middle area: left sidebar + main view */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Left tool sidebar — full height */}
        <aside
          className={`relative z-30 flex flex-col border-r border-crimson-900/40 bg-cosmic-900/95 backdrop-blur-xl transition-all duration-500 ease-out ${
            leftOpen ? 'w-64 opacity-100' : 'w-0 overflow-hidden opacity-0'
          }`}
        >
          <div className="absolute right-0 top-0 h-16 w-[2px] bg-gradient-to-b from-crimson-600 to-transparent" />
          <LeftSidebar />
        </aside>

        {/* Main view */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {workspace === 'graph' && (
            <div
              className="relative min-h-0 flex-1 select-none"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData('application/heart-content-item');
                if (!raw) return;
                try {
                  const { itemId, sourceNodeId } = JSON.parse(raw);
                  moveContentItemToNode(itemId, sourceNodeId, currentViewNodeId);
                } catch {
                  // ignore invalid drop
                }
              }}
            >
              <Graph3D
                nodes={graphNodes}
                links={graphLinks}
                viewNodeId={currentViewNodeId}
                onNodeClick={handleNodeClick}
                onEnterView={handleEnterView}
                filtered
                simplified={graphLimited}
                resetCameraSignal={cameraResetSignal}
              />
              <MultiSelectToolbar />
              <BreadcrumbTrail
                currentViewNodeId={currentViewNodeId}
                viewStack={viewStack}
                nodes={nodes}
                onEnter={enterNodeView}
                onExit={exitNodeView}
                onRoot={goToRootView}
                onResetCamera={() => setCameraResetSignal((s) => s + 1)}
              />
            </div>
          )}

          {workspace === 'execution' && (
            <div className="relative min-h-0 flex-1 select-none">
              <ExecutionTab />
            </div>
          )}

          {workspace === 'reasoning' && <ReasoningWorkspace />}
        </div>
      </div>

      {/* Floating layers */}
      <StickyNotesLayer />
      <ChatPanel />
      <AcademicToolsPanel />
      <VisualSupervisionPanel />
      <EvidenceReviewDashboard />
      <OverviewPanel />
      <ContentClusterPanel />
      <ChangeLogPanel />
      <AutoModePanel />

      {/* Avant-garde corner glyphs */}
      <div className="pointer-events-none absolute left-4 top-16 z-40 hidden text-[10px] font-mono tracking-widest text-cosmic-700 md:block">
        AVANT / 01
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 z-40 hidden text-[10px] font-mono tracking-widest text-cosmic-700 md:block">
        HEART / CORE
      </div>
    </main>
  );
}

function BreadcrumbTrail({
  currentViewNodeId,
  viewStack,
  nodes,
  onEnter,
  onExit,
  onRoot,
  onResetCamera,
}: {
  currentViewNodeId: string | null;
  viewStack: string[];
  nodes: { id: string; label: string }[];
  onEnter: (id: string | null) => void;
  onExit: () => void;
  onRoot: () => void;
  onResetCamera: () => void;
}) {
  if (!currentViewNodeId) return null;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="absolute left-4 top-16 z-30 flex items-center gap-1 rounded-sm border border-cosmic-700 bg-cosmic-900/80 px-3 py-1.5 text-xs backdrop-blur-md">
      <button onClick={onRoot} className="text-cosmic-400 transition-colors hover:text-cosmic-200">
        根视图
      </button>
      {viewStack.map((id) => (
        <span key={id} className="flex items-center gap-1">
          <span className="text-cosmic-600">/</span>
          <button onClick={() => onEnter(id)} className="text-cosmic-400 transition-colors hover:text-cosmic-200">
            {nodeMap.get(id)?.label || '…'}
          </button>
        </span>
      ))}
      <span className="text-cosmic-600">/</span>
      <span className="font-medium text-cosmic-100">{nodeMap.get(currentViewNodeId)?.label || '…'}</span>
      <button onClick={onExit} className="ml-2 text-cosmic-500 transition-colors hover:text-crimson-400">
        返回
      </button>
      <button
        onClick={onResetCamera}
        className="ml-2 text-cosmic-500 transition-colors hover:text-crimson-400"
        title="摄影机回位"
      >
        回位
      </button>
    </div>
  );
}
