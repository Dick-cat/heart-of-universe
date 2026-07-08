import { GraphNode, GraphLink, ReasoningPath } from './types';

export const TYPE_COLOR_MAP: Record<GraphNode['type'], string> = {
  concept: '#3b82f6',   // blue-500
  principle: '#8b5cf6', // violet-500
  meta: '#f59e0b',      // amber-500
  paper: '#10b981',     // emerald-500
  note: '#64748b',      // slate-500
  custom: '#06b6d4',    // cyan-500
  communication: '#ef4444', // red-500 — 通讯
  'ai-brief': '#ec4899',    // pink-500 — AI 短述
};

export function buildGraphData(nodes: GraphNode[], links: GraphLink[]) {
  return {
    nodes: nodes.map((n) => ({
      ...n,
      val: n.val ?? Math.max(2, (n.attachments?.length || 0) + (n.contentItems?.length || 0) + 1),
      color: n.color || TYPE_COLOR_MAP[n.type],
    })),
    links: links.map((l) => ({
      ...l,
      value: l.value ?? 1,
    })),
  };
}

export function typeColor(type: GraphNode['type']): string {
  return TYPE_COLOR_MAP[type];
}

export function generateId(prefix = 'node'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}


/** Find all simple paths between source and target up to maxLength edges */
export function findPaths(
  nodes: GraphNode[],
  links: GraphLink[],
  sourceId: string,
  targetId: string,
  maxLength = 4
): ReasoningPath[] {
  if (sourceId === targetId) return [];
  const adj = new Map<string, { id: string; target: string; label?: string }[]>();
  for (const l of links) {
    const s = l.source as string;
    const t = l.target as string;
    const arr = adj.get(s) || [];
    arr.push({ id: `${s}->${t}`, target: t, label: l.label });
    adj.set(s, arr);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const results: ReasoningPath[] = [];

  const dfs = (current: string, target: string, path: string[], edges: { source: string; target: string; label?: string }[], visited: Set<string>) => {
    if (path.length > maxLength + 1) return;
    if (current === target) {
      results.push(buildPath(path, edges, nodeMap));
      return;
    }
    for (const e of adj.get(current) || []) {
      if (visited.has(e.target)) continue;
      visited.add(e.target);
      dfs(e.target, target, [...path, e.target], [...edges, { source: current, target: e.target, label: e.label }], visited);
      visited.delete(e.target);
    }
  };

  dfs(sourceId, targetId, [sourceId], [], new Set([sourceId]));

  return results.sort((a, b) => b.score - a.score);
}

function buildPath(
  nodeIds: string[],
  edges: { source: string; target: string; label?: string }[],
  nodeMap: Map<string, GraphNode>
): ReasoningPath {
  const evidenceStrength = nodeIds.reduce((sum, id) => {
    const n = nodeMap.get(id);
    if (!n) return sum;
    return sum + Math.min(1, (n.attachments?.length || 0) * 0.2 + (n.contentItems?.length || 0) * 0.1);
  }, 0) / Math.max(1, nodeIds.length);

  const length = edges.length;
  const score = (evidenceStrength * 0.5 + (1 / (1 + length)) * 0.5);

  return {
    nodes: nodeIds,
    edges,
    score,
    length,
    evidenceStrength,
  };
}

/** Find descendants of a node (children recursively) */
export function getDescendants(nodes: GraphNode[], parentId: string): GraphNode[] {
  const result: GraphNode[] = [];
  const collect = (id: string) => {
    for (const n of nodes) {
      if (n.parentId === id) {
        result.push(n);
        collect(n.id);
      }
    }
  };
  collect(parentId);
  return result;
}

/** Compute grade-based visual weight */
export function gradeMultiplier(grade?: GraphNode['grade']): number {
  switch (grade) {
    case 'core':
      return 1.6;
    case 'important':
      return 1.25;
    case 'peripheral':
      return 0.7;
    default:
      return 1;
  }
}
