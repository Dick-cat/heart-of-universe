'use client';

import { useState, useMemo } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { clusterNodesByContent, buildNodeClusterMap } from '@/lib/content-similarity';
import { ContentCluster, GraphNode } from '@/lib/types';

export function ContentClusterPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const nodes = useGraphStore((s) => s.nodes);
  const contentClusters = useGraphStore((s) => s.contentClusters);
  const setContentClusters = useGraphStore((s) => s.setContentClusters);
  const nebulaMode = useGraphStore((s) => s.nebulaMode);
  const setNebulaMode = useGraphStore((s) => s.setNebulaMode);
  const setHighlightedNodeIds = useGraphStore((s) => s.setHighlightedNodeIds);
  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const runClustering = async () => {
    setLoading(true);
    setError('');
    try {
      const clusters = await clusterNodesByContent({
        nodes,
        provider: llmProvider,
        apiKey: llmApiKey,
        baseURL: llmBaseUrl,
        model: llmModel,
      });
      setContentClusters(clusters);
      setNebulaMode(false);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || '聚类失败');
    } finally {
      setLoading(false);
    }
  };

  const clearClusters = () => {
    setContentClusters([]);
    setNebulaMode(false);
    setEditing(false);
    setHighlightedClusterId(null);
  };

  const applyNebula = () => {
    setNebulaMode(true);
    setEditing(false);
  };

  const exitNebula = () => {
    setNebulaMode(false);
  };

  const setHighlightedClusterId = (id: string | null) => {
    setHoveredClusterId(id);
    if (!id) {
      setHighlightedNodeIds(new Set());
      return;
    }
    const cluster = contentClusters.find((c) => c.id === id);
    setHighlightedNodeIds(new Set(cluster?.nodeIds || []));
  };

  const moveNodeToCluster = (nodeId: string, targetClusterId: string) => {
    setContentClusters((prev) =>
      prev.map((c) => {
        if (c.id === targetClusterId) {
          return { ...c, nodeIds: Array.from(new Set([...c.nodeIds, nodeId])) };
        }
        return { ...c, nodeIds: c.nodeIds.filter((id) => id !== nodeId) };
      })
    );
  };

  const unassignedNodeIds = useMemo(() => {
    const assigned = new Set(contentClusters.flatMap((c) => c.nodeIds));
    return nodes.filter((n) => !assigned.has(n.id)).map((n) => n.id);
  }, [nodes, contentClusters]);

  const startEditing = () => {
    setEditing(true);
    setNebulaMode(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`fixed right-4 top-[32rem] z-40 flex h-10 w-10 items-center justify-center border border-cosmic-700 bg-cosmic-900/90 text-cosmic-200 shadow-lg backdrop-blur-xl transition-transform hover:scale-110 active:scale-95 ${
          open ? 'z-50' : 'z-40'
        } ${nebulaMode ? 'border-crimson-500 text-crimson-300' : ''}`}
        title="内容聚类热力图"
      >
        {nebulaMode ? '✦' : '🔥'}
      </button>

      {open && (
        <div className="fixed right-16 top-[32rem] z-50 w-[460px] rounded-sm border border-cosmic-700 bg-cosmic-900/95 p-4 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between border-b border-cosmic-800 pb-2">
            <div>
              <div className="font-bold tracking-wider text-cosmic-100">
                {nebulaMode ? '星云板块视图已启用' : '内容聚类热力图'}
              </div>
              <div className="text-[10px] text-cosmic-500">
                {nebulaMode
                  ? '仅显示同一区块内的连线'
                  : 'AI 评估相近内容形成的区块'}
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-cosmic-400 hover:text-cosmic-100">
              ×
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={runClustering}
              disabled={loading || nodes.length === 0}
              className="flex-1 rounded-sm bg-crimson-700 py-1.5 text-xs text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
            >
              {loading ? 'AI 评估中…' : 'AI 评估内容区块'}
            </button>
            {contentClusters.length > 0 && !nebulaMode && (
              <button
                onClick={applyNebula}
                className="flex-1 rounded-sm border border-crimson-700 bg-crimson-950/30 py-1.5 text-xs text-crimson-300 transition-colors hover:bg-crimson-900/40 hover:text-crimson-200"
              >
                应用星云板块视图
              </button>
            )}
            {contentClusters.length > 0 && nebulaMode && (
              <button
                onClick={exitNebula}
                className="flex-1 rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-1.5 text-xs text-cosmic-300 transition-colors hover:text-cosmic-100"
              >
                退出星云板块视图
              </button>
            )}
            {contentClusters.length > 0 && (
              <button
                onClick={editing ? () => setEditing(false) : startEditing}
                className={`rounded-sm border px-3 py-1.5 text-xs transition-colors ${
                  editing
                    ? 'border-crimson-700 bg-crimson-950/30 text-crimson-300 hover:text-crimson-200'
                    : 'border-cosmic-700 bg-cosmic-800/60 text-cosmic-300 hover:text-cosmic-100'
                }`}
              >
                {editing ? '完成修改' : '修改区块'}
              </button>
            )}
            {contentClusters.length > 0 && (
              <button
                onClick={clearClusters}
                className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-3 py-1.5 text-xs text-cosmic-300 transition-colors hover:text-cosmic-100"
              >
                清除
              </button>
            )}
          </div>

          {error && <div className="mb-2 rounded-sm bg-crimson-950/40 p-2 text-xs text-crimson-300">{error}</div>}

          {contentClusters.length === 0 && !loading && (
            <div className="py-6 text-center text-sm text-cosmic-500">
              点击按钮，AI 将基于节点标签、描述和内容条目评估内容关联水平并划分区块。
            </div>
          )}

          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {contentClusters.map((cluster) => (
              <div
                key={cluster.id}
                onMouseEnter={() => setHighlightedClusterId(cluster.id)}
                onMouseLeave={() => setHighlightedClusterId(null)}
                className={`cursor-pointer rounded-sm border p-3 transition-colors ${
                  hoveredClusterId === cluster.id ? 'border-crimson-600 bg-crimson-950/20' : 'border-cosmic-700 bg-panel-elevated'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: cluster.color }}
                  />
                  <span className="flex-1 font-medium text-cosmic-200">{cluster.label}</span>
                  {typeof cluster.score === 'number' && (
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[10px] ${
                        cluster.score >= 0.8
                          ? 'bg-emerald-900/40 text-emerald-300'
                          : cluster.score >= 0.5
                          ? 'bg-amber-900/40 text-amber-300'
                          : 'bg-crimson-900/40 text-crimson-300'
                      }`}
                    >
                      {(cluster.score * 10).toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-cosmic-500">{cluster.explanation}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {cluster.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-1.5 py-0.5 text-[10px] text-cosmic-400"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-cosmic-600">
                  {cluster.nodeIds.length} 个节点
                </div>

                {editing && (
                  <div className="mt-3 space-y-1 border-t border-cosmic-800 pt-2">
                    <div className="text-[10px] uppercase tracking-wider text-cosmic-500">区块节点</div>
                    <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                      {cluster.nodeIds.map((nodeId) => {
                        const node = nodeMap.get(nodeId);
                        if (!node) return null;
                        return (
                          <div key={nodeId} className="flex items-center gap-2">
                            <span className="flex-1 truncate text-xs text-cosmic-300">{node.label}</span>
                            <select
                              value={cluster.id}
                              onChange={(e) => moveNodeToCluster(nodeId, e.target.value)}
                              className="cosmic-input py-0.5 text-[10px]"
                            >
                              <option value={cluster.id}>当前区块</option>
                              {contentClusters
                                .filter((c) => c.id !== cluster.id)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    移到：{c.label}
                                  </option>
                                ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {editing && unassignedNodeIds.length > 0 && (
              <div className="rounded-sm border border-amber-900/50 bg-amber-950/20 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-wider text-amber-500">未分配节点</div>
                <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                  {unassignedNodeIds.map((nodeId) => {
                    const node = nodeMap.get(nodeId);
                    if (!node) return null;
                    return (
                      <div key={nodeId} className="flex items-center gap-2">
                        <span className="flex-1 truncate text-xs text-cosmic-300">{node.label}</span>
                        <select
                          value=""
                          onChange={(e) => e.target.value && moveNodeToCluster(nodeId, e.target.value)}
                          className="cosmic-input py-0.5 text-[10px]"
                        >
                          <option value="">分配到…</option>
                          {contentClusters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
