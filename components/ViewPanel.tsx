'use client';

import { useState, useMemo } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { GraphNode } from '@/lib/types';
import { typeColor } from '@/lib/graph-utils';

type Tab = 'hierarchy' | 'global' | 'path';

function buildTree(nodes: GraphNode[]) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    if (n.parentId) {
      const arr = childrenMap.get(n.parentId) || [];
      arr.push(n);
      childrenMap.set(n.parentId, arr);
    }
  }
  const roots = nodes.filter((n) => !n.parentId).sort((a, b) => (a.label || '').localeCompare(b.label || ''));

  function countDescendants(id: string): number {
    const children = childrenMap.get(id) || [];
    return children.length + children.reduce((sum, c) => sum + countDescendants(c.id), 0);
  }

  return { roots, childrenMap, nodeMap, countDescendants };
}

export function ViewPanel() {
  const [tab, setTab] = useState<Tab>('hierarchy');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const viewMode = useGraphStore((s) => s.viewMode);
  const setViewMode = useGraphStore((s) => s.setViewMode);
  const clusterMode = useGraphStore((s) => s.clusterMode);
  const toggleClusterMode = useGraphStore((s) => s.toggleClusterMode);
  const nebulaMode = useGraphStore((s) => s.nebulaMode);
  const setNebulaMode = useGraphStore((s) => s.setNebulaMode);
  const contentClusters = useGraphStore((s) => s.contentClusters);
  const currentViewNodeId = useGraphStore((s) => s.currentViewNodeId);
  const viewStack = useGraphStore((s) => s.viewStack);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const enterNodeView = useGraphStore((s) => s.enterNodeView);
  const goToRootView = useGraphStore((s) => s.goToRootView);
  const openStickyNote = useGraphStore((s) => s.openStickyNote);

  const { roots, childrenMap, nodeMap, countDescendants } = useMemo(() => buildTree(nodes), [nodes]);

  const handleSelect = (node: GraphNode) => {
    setSelectedNodeId(node.id);
    openStickyNote(node.id);
  };

  const handleEnter = (node: GraphNode) => {
    if ((childrenMap.get(node.id)?.length || 0) > 0) {
      enterNodeView(node.id);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pathIds = [...viewStack, currentViewNodeId || ''].filter(Boolean);

  return (
    <div className="space-y-3 rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-3">
      {/* Tabs */}
      <div className="flex rounded-sm border border-cosmic-800 bg-cosmic-900/50 p-0.5">
        {[
          { key: 'hierarchy', label: '层级' },
          { key: 'global', label: '全局' },
          { key: 'path', label: '路径' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={`flex-1 rounded-sm py-1 text-[10px] transition-colors ${
              tab === t.key ? 'bg-crimson-700 text-white' : 'text-cosmic-400 hover:text-cosmic-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Global view controls */}
      {tab === 'global' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-cosmic-300">
            <span>全局节点</span>
            <span className="text-cosmic-500">{nodes.length}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setViewMode('global');
                goToRootView();
              }}
              className={`flex-1 rounded-sm px-2 py-1 text-[10px] transition-colors ${
                viewMode === 'global'
                  ? 'bg-crimson-700 text-white'
                  : 'border border-cosmic-700 bg-cosmic-900/50 text-cosmic-300 hover:border-crimson-700'
              }`}
            >
              显示全部节点
            </button>
            <button
              onClick={() => {
                setViewMode('normal');
                goToRootView();
              }}
              className={`flex-1 rounded-sm px-2 py-1 text-[10px] transition-colors ${
                viewMode === 'normal'
                  ? 'bg-cosmic-700 text-white'
                  : 'border border-cosmic-700 bg-cosmic-900/50 text-cosmic-300 hover:border-crimson-700'
              }`}
            >
              返回正常视图
            </button>
          </div>
          <button
            onClick={toggleClusterMode}
            className={`w-full rounded-sm px-2 py-1 text-[10px] transition-colors ${
              clusterMode
                ? 'bg-crimson-900/40 text-crimson-400'
                : 'border border-cosmic-700 bg-cosmic-900/50 text-cosmic-300 hover:border-crimson-700'
            }`}
          >
            {clusterMode ? '关闭星云聚类' : '开启星云聚类'}
          </button>
          <button
            onClick={() => setNebulaMode(!nebulaMode)}
            disabled={contentClusters.length === 0}
            className={`w-full rounded-sm px-2 py-1 text-[10px] transition-colors disabled:opacity-40 ${
              nebulaMode
                ? 'bg-crimson-700 text-white'
                : 'border border-cosmic-700 bg-cosmic-900/50 text-cosmic-300 hover:border-crimson-700'
            }`}
          >
            {nebulaMode ? '关闭星云板块视图' : '开启星云板块视图'}
          </button>
          <p className="text-[10px] leading-relaxed text-cosmic-500">
            节点过多时，画布会自动聚合为顶层视图；在“层级”面板可展开分级。
          </p>
        </div>
      )}

      {/* Path view */}
      {tab === 'path' && (
        <div className="space-y-1">
          {pathIds.length === 0 && <div className="text-[10px] text-cosmic-500">当前在根视图</div>}
          {pathIds.map((id, i) => {
            const node = nodeMap.get(id);
            if (!node) return null;
            return (
              <div
                key={id}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-xs text-cosmic-300 hover:bg-cosmic-800/60"
                onClick={() => {
                  setSelectedNodeId(node.id);
                  enterNodeView(node.id);
                }}
                style={{ paddingLeft: `${8 + i * 12}px` }}
              >
                <span className="text-cosmic-600">{'›'.repeat(i + 1)}</span>
                <span className="truncate">{node.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Hierarchy tree */}
      {tab === 'hierarchy' && (
        <div className="max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
          {roots.length === 0 && <div className="text-[10px] text-cosmic-500">暂无节点</div>}
          {roots.map((root) => (
            <TreeNode
              key={root.id}
              node={root}
              depth={0}
              childrenMap={childrenMap}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onSelect={handleSelect}
              onEnter={handleEnter}
              countDescendants={countDescendants}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  childrenMap,
  expanded,
  toggleExpand,
  onSelect,
  onEnter,
  countDescendants,
}: {
  node: GraphNode;
  depth: number;
  childrenMap: Map<string, GraphNode[]>;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (node: GraphNode) => void;
  onEnter: (node: GraphNode) => void;
  countDescendants: (id: string) => number;
}) {
  const children = childrenMap.get(node.id) || [];
  const isExpanded = expanded.has(node.id);
  const color = typeColor(node.type);

  return (
    <div>
      <div
        className="group flex cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-xs text-cosmic-300 hover:bg-cosmic-800/60"
        style={{ paddingLeft: `${4 + depth * 14}px` }}
        onClick={(e) => {
          if (children.length > 0 && e.ctrlKey) {
            toggleExpand(node.id);
          } else if (children.length > 0) {
            onEnter(node);
          } else {
            onSelect(node);
          }
        }}
      >
        {children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
            className="flex h-4 w-4 items-center justify-center text-[10px] text-cosmic-500 hover:text-cosmic-200"
          >
            {isExpanded ? '−' : '+'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="h-2 w-2 rounded-full shadow-[0_0_6px_currentColor]" style={{ backgroundColor: color, color }} />
        <span className="flex-1 truncate">{node.label}</span>
        {children.length > 0 && (
          <span className="text-[10px] text-cosmic-500">+{countDescendants(node.id)}</span>
        )}
      </div>
      {isExpanded &&
        children
          .sort((a, b) => (a.label || '').localeCompare(b.label || ''))
          .map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              childrenMap={childrenMap}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
              onEnter={onEnter}
              countDescendants={countDescendants}
            />
          ))}
    </div>
  );
}
