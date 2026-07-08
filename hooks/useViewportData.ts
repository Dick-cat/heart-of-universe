'use client';

import { useMemo } from 'react';
import { useGraphStore } from './useGraphStore';
import { GraphNode, GraphLink, ContentCluster } from '@/lib/types';

export interface ViewportData {
  visibleNodes: GraphNode[];
  visibleLinks: GraphLink[];
  currentNode: GraphNode | null;
}

function filterSameClusterLinks(links: GraphLink[], contentClusters: ContentCluster[]): GraphLink[] {
  const clusterIdByNode = new Map<string, string>();
  for (const cluster of contentClusters) {
    for (const nodeId of cluster.nodeIds) {
      clusterIdByNode.set(nodeId, cluster.id);
    }
  }
  return links.filter((l) => {
    const sc = clusterIdByNode.get(l.source as string);
    const tc = clusterIdByNode.get(l.target as string);
    return sc && tc && sc === tc;
  });
}

export function useViewportData(viewNodeId: string | null): ViewportData {
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const viewMode = useGraphStore((s) => s.viewMode);
  const nebulaMode = useGraphStore((s) => s.nebulaMode);
  const contentClusters = useGraphStore((s) => s.contentClusters);

  return useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const currentNode = viewNodeId ? nodeMap.get(viewNodeId) || null : null;

    const baseLinks = nebulaMode && contentClusters.length > 0 ? filterSameClusterLinks(links, contentClusters) : links;

    if (viewMode === 'global') {
      return {
        visibleNodes: nodes,
        visibleLinks: baseLinks,
        currentNode,
      };
    }

    if (!currentNode) {
      const visible = nodes.filter((n) => !n.parentId);
      const visibleIds = new Set(visible.map((n) => n.id));
      return {
        visibleNodes: visible,
        visibleLinks: baseLinks.filter(
          (l) => visibleIds.has(l.source as string) && visibleIds.has(l.target as string)
        ),
        currentNode,
      };
    }

    const realChildren = nodes.filter((n) => n.parentId === currentNode.id);
    const visible: GraphNode[] = [currentNode, ...realChildren];

    const visibleIds = new Set(visible.map((n) => n.id));
    const vLinks: GraphLink[] = baseLinks.filter(
      (l) => visibleIds.has(l.source as string) && visibleIds.has(l.target as string)
    );

    for (const child of realChildren) {
      const key = `${currentNode.id}->${child.id}`;
      if (!vLinks.some((l) => `${l.source}->${l.target}` === key)) {
        vLinks.push({ source: currentNode.id, target: child.id, label: '包含' });
      }
    }

    return { visibleNodes: visible, visibleLinks: vLinks, currentNode };
  }, [nodes, links, viewNodeId, viewMode, nebulaMode, contentClusters]);
}
