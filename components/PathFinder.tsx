'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { findPaths } from '@/lib/graph-utils';

const MAX_HOPS = 12;

export function PathFinder() {
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const pathSourceId = useGraphStore((s) => s.pathSourceId);
  const pathTargetId = useGraphStore((s) => s.pathTargetId);
  const setPathSourceId = useGraphStore((s) => s.setPathSourceId);
  const setPathTargetId = useGraphStore((s) => s.setPathTargetId);
  const setPathHighlightNodeIds = useGraphStore((s) => s.setPathHighlightNodeIds);
  const setPathHighlightLinkIds = useGraphStore((s) => s.setPathHighlightLinkIds);
  const setPathFinderActive = useGraphStore((s) => s.setPathFinderActive);
  const clearPathFinder = useGraphStore((s) => s.clearPathFinder);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  const [maxLength, setMaxLength] = useState(6);
  const [paths, setPaths] = useState<ReturnType<typeof findPaths>>([]);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState('');

  const sourceNode = nodes.find((n) => n.id === pathSourceId);
  const targetNode = nodes.find((n) => n.id === pathTargetId);

  useEffect(() => {
    setPathFinderActive(true);
    return () => {
      // Keep state persisted across tab switches, but clear highlight if user leaves PathFinder entirely
      // setPathFinderActive(false);
    };
  }, [setPathFinderActive]);

  useEffect(() => {
    if (pathSourceId && pathTargetId) {
      const found = findPaths(nodes, links, pathSourceId, pathTargetId, maxLength);
      setPaths(found);
      if (found.length > 0) {
        const allNodeIds = new Set<string>();
        const allLinkIds = new Set<string>();
        found.forEach((p) => {
          p.nodes.forEach((id) => allNodeIds.add(id));
          p.edges.forEach((e) => {
            allLinkIds.add(`${e.source}->${e.target}`);
            allLinkIds.add(`${e.target}->${e.source}`);
          });
        });
        setPathHighlightNodeIds(allNodeIds);
        setPathHighlightLinkIds(allLinkIds);
      } else {
        setPathHighlightNodeIds(new Set([pathSourceId, pathTargetId]));
        setPathHighlightLinkIds(new Set());
      }
    } else {
      setPaths([]);
      if (pathSourceId) {
        setPathHighlightNodeIds(new Set([pathSourceId]));
      } else {
        setPathHighlightNodeIds(new Set());
      }
      setPathHighlightLinkIds(new Set());
    }
  }, [
    pathSourceId,
    pathTargetId,
    nodes,
    links,
    maxLength,
    setPathHighlightNodeIds,
    setPathHighlightLinkIds,
  ]);

  const setFromSelected = (which: 'source' | 'target') => {
    if (!selectedNodeId) return alert('请先在图谱中单击选中一个节点');
    if (which === 'source') setPathSourceId(selectedNodeId);
    else setPathTargetId(selectedNodeId);
  };

  const reset = () => {
    setPaths([]);
    setSuggestion('');
    clearPathFinder();
  };

  const aiComplete = async () => {
    if (!sourceNode || !targetNode) return;
    setAiSuggesting(true);
    setSuggestion('');
    try {
      const store = useGraphStore.getState();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'You are a knowledge graph assistant. The user wants to connect two nodes but there is no path. Suggest 2-4 intermediate nodes (with types) and relations that could bridge them. Respond with JSON only: {"nodes":[{"label":"name","type":"concept"}],"relations":[{"from":"label","to":"label","label":"relation"}]}',
            },
            {
              role: 'user',
              content: `Source: ${sourceNode.label} (${sourceNode.type})\nTarget: ${targetNode.label} (${targetNode.type})\nExisting nearby nodes: ${nodes.slice(0, 30).map((n) => n.label).join(', ')}`,
            },
          ],
          provider: store.llmProvider,
          apiKey: store.llmApiKey,
          baseURL: store.llmBaseUrl,
          model: store.llmModel,
          responseFormat: 'json_object',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const parsed = JSON.parse(json.content);
      const suggestedNodes = parsed.nodes || [];
      const suggestedRelations = parsed.relations || [];
      setSuggestion(
        `建议补充节点：${suggestedNodes.map((n: any) => n.label).join('、') || '无'}\n建议关系：${suggestedRelations
          .map((r: any) => `${r.from} → ${r.to} (${r.label})`)
          .join('、') || '无'}`
      );
    } catch (err: any) {
      setSuggestion('AI 补全失败：' + err.message);
    } finally {
      setAiSuggesting(false);
    }
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2 text-[10px] leading-relaxed text-cosmic-400">
        开启多跳导航后，直接在图谱中单击节点即可设置起点/终点。当前选中节点可快速设为起点或终点。
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFromSelected('source')}
          className={`flex-1 rounded-sm py-1 text-[10px] transition-colors ${
            pathSourceId ? 'bg-cosmic-800 text-cosmic-200' : 'bg-crimson-900/40 text-crimson-300 hover:bg-crimson-900/60'
          }`}
        >
          {pathSourceId ? `起点: ${sourceNode?.label?.slice(0, 12)}` : '从选中节点设起点'}
        </button>
        <button
          onClick={() => setFromSelected('target')}
          className={`flex-1 rounded-sm py-1 text-[10px] transition-colors ${
            pathTargetId ? 'bg-cosmic-800 text-cosmic-200' : 'bg-crimson-900/40 text-crimson-300 hover:bg-crimson-900/60'
          }`}
        >
          {pathTargetId ? `终点: ${targetNode?.label?.slice(0, 12)}` : '从选中节点设终点'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-cosmic-500">最大跳数</span>
        <input
          type="range"
          min={2}
          max={MAX_HOPS}
          value={maxLength}
          onChange={(e) => setMaxLength(parseInt(e.target.value))}
          className="w-24"
        />
        <span className="text-cosmic-300">{maxLength}</span>
        <button onClick={reset} className="ml-auto rounded-sm border border-cosmic-700 px-2 py-0.5 text-[10px] text-cosmic-400 hover:text-cosmic-200">
          重置
        </button>
      </div>

      {paths.length === 0 && pathSourceId && pathTargetId && (
        <div className="space-y-2 rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2">
          <div className="text-cosmic-500">未找到路径</div>
          <button
            onClick={aiComplete}
            disabled={aiSuggesting}
            className="w-full rounded-sm bg-crimson-700 py-1 text-[10px] text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
          >
            {aiSuggesting ? 'AI 思考中…' : 'AI 补全路径（右上角AI生成或手动添加节点）'}
          </button>
          {suggestion && <div className="whitespace-pre-wrap text-[10px] text-cosmic-300">{suggestion}</div>}
        </div>
      )}

      {paths.map((p, i) => (
        <div key={i} className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2">
          <div className="flex items-center justify-between">
            <span className="text-cosmic-200">路径 {i + 1}</span>
            <span className="text-[10px] text-cosmic-500">
              {p.length} 跳 · 评分 {Math.round(p.score * 100)}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-cosmic-400">
            {p.nodes.map((id) => nodes.find((n) => n.id === id)?.label || id).join(' → ')}
          </div>
        </div>
      ))}
    </div>
  );
}
