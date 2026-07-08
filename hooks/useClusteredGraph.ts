'use client';

import { useMemo } from 'react';
import { GraphNode, GraphLink } from '@/lib/types';
import { generateId } from '@/lib/graph-utils';

export const MAX_GLOBAL_NODES = 500;
const MAX_ROOT_NODES = 200;

export interface ClusteredGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  limited: boolean;
  totalNodes: number;
}

export function useClusteredGraph(
  nodes: GraphNode[],
  links: GraphLink[],
  viewMode: 'normal' | 'global'
): ClusteredGraph {
  return useMemo(() => {
    if (viewMode !== 'global' || nodes.length <= MAX_GLOBAL_NODES) {
      return { nodes, links, limited: false, totalNodes: nodes.length };
    }

    const roots = nodes.filter((n) => !n.parentId);

    if (roots.length <= MAX_ROOT_NODES) {
      const rootIds = new Set(roots.map((n) => n.id));
      return {
        nodes: roots,
        links: links.filter(
          (l) => rootIds.has(l.source as string) && rootIds.has(l.target as string)
        ),
        limited: true,
        totalNodes: nodes.length,
      };
    }

    // Too many roots: group by type
    const byType = new Map<string, GraphNode[]>();
    for (const n of roots) {
      const arr = byType.get(n.type) || [];
      arr.push(n);
      byType.set(n.type, arr);
    }

    const clusters: GraphNode[] = [];
    const clusterByType = new Map<string, GraphNode>();
    for (const [type, members] of Array.from(byType.entries())) {
      const cluster: GraphNode = {
        id: `cluster:${type}`,
        label: `${typeLabel(type as GraphNode['type'])} (${members.length})`,
        type: 'meta',
        description: `包含 ${members.length} 个顶层节点`,
        color: '#94a3b8',
        val: Math.max(6, Math.min(24, 6 + members.length * 0.5)),
        attachments: [],
        contentItems: [],
        metadata: { tags: [type], createdAt: Date.now(), updatedAt: Date.now() },
      };
      clusters.push(cluster);
      clusterByType.set(type, cluster);
    }

    const nodeToType = new Map<string, string>();
    for (const n of roots) nodeToType.set(n.id, n.type);

    const seen = new Set<string>();
    const aggregatedLinks: GraphLink[] = [];
    for (const l of links) {
      const s = l.source as string;
      const t = l.target as string;
      const sType = nodeToType.get(s);
      const tType = nodeToType.get(t);
      if (!sType || !tType) continue;
      if (sType === tType) continue; // internal cluster
      const key = `${sType}->${tType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      aggregatedLinks.push({
        source: clusterByType.get(sType)!.id,
        target: clusterByType.get(tType)!.id,
        label: '聚合关系',
        value: 1,
      });
    }

    return {
      nodes: clusters,
      links: aggregatedLinks,
      limited: true,
      totalNodes: nodes.length,
    };
  }, [nodes, links, viewMode]);
}

function typeLabel(type: GraphNode['type']): string {
  const map: Record<string, string> = {
    concept: '概念',
    principle: '原理',
    meta: '元知识',
    paper: '论文',
    note: '笔记',
    custom: '自定义',
    communication: '通讯',
    'ai-brief': 'AI 短述',
  };
  return map[type] || type;
}
