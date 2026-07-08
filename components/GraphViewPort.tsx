'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useGraphStore } from '@/hooks/useGraphStore';
import { useViewportData } from '@/hooks/useViewportData';

const Graph3D = dynamic(() => import('@/components/Graph3D'), { ssr: false });

interface GraphViewPortProps {
  initialViewNodeId?: string | null;
  className?: string;
}

export function GraphViewPort({ initialViewNodeId = null, className }: GraphViewPortProps) {
  const [viewNodeId, setViewNodeId] = useState<string | null>(initialViewNodeId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { visibleNodes, visibleLinks, currentNode } = useViewportData(viewNodeId);

  const handleNodeClick = useCallback((id: string, _x?: number, _y?: number) => {
    setSelectedId(id);
  }, []);

  const handleEnterView = useCallback((id: string) => {
    setViewNodeId(id);
    setSelectedId(null);
  }, []);

  const handleExitView = useCallback(() => {
    if (!currentNode) {
      setViewNodeId(null);
      return;
    }
    setViewNodeId(currentNode.parentId || null);
    setSelectedId(null);
  }, [currentNode]);

  const selectedRealNode = selectedId ? visibleNodes.find((n) => n.id === selectedId) : null;

  return (
    <div className={`relative flex h-full flex-col overflow-hidden rounded-sm border border-cosmic-700 bg-cosmic-950 ${className || ''}`}>
      <div className="flex items-center justify-between border-b border-cosmic-800 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-cosmic-400">
          <button onClick={() => setViewNodeId(null)} className="text-cosmic-500 hover:text-cosmic-200">
            根
          </button>
          {currentNode && (
            <>
              <span>/</span>
              <span className="text-cosmic-200">{currentNode.label}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {viewNodeId && (
            <button
              onClick={handleExitView}
              className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-2 py-1 text-[10px] text-cosmic-300 hover:text-cosmic-100"
            >
              返回
            </button>
          )}
          <div className="text-[10px] text-cosmic-600">节点 {visibleNodes.length}</div>
        </div>
      </div>

      <div className="relative flex-1">
        <Graph3D
          nodes={visibleNodes}
          links={visibleLinks}
          viewNodeId={viewNodeId}
          onNodeClick={handleNodeClick}
          onEnterView={handleEnterView}
          filtered
          selectedId={selectedId}
        />
      </div>

      {selectedRealNode && (
        <div className="absolute bottom-2 left-2 right-2 z-20 rounded-sm border border-cosmic-700 bg-cosmic-900/90 p-2 text-xs backdrop-blur-md">
          <div className="font-medium text-cosmic-100">{selectedRealNode.label}</div>
          <div className="text-cosmic-500">{selectedRealNode.description || '无描述'}</div>
        </div>
      )}
    </div>
  );
}
