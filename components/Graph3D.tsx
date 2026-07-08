'use client';

import { useRef, useCallback, useEffect, useMemo, useState, memo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { GraphNode, GraphLink } from '@/lib/types';
import { buildGraphData, typeColor, gradeMultiplier } from '@/lib/graph-utils';
import { getAIGradeColor, getAIGradeDefinition } from '@/lib/ai-grading';
import { buildNodeClusterMap } from '@/lib/content-similarity';
import { useGraphStore } from '@/hooks/useGraphStore';

interface Graph3DProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (id: string, clickX?: number, clickY?: number) => void;
  /** If provided, overrides the store-level current view. Used by multi-view. */
  viewNodeId?: string | null;
  /** Called when the user double-clicks a node to enter its sub-network. */
  onEnterView?: (id: string) => void;
  /** When true, the provided nodes/links are used as-is without additional view filtering. */
  filtered?: boolean;
  /** Local selection id that overrides the global selectedNodeId for this instance. */
  selectedId?: string | null;
  /** Increment to reset camera to default position. */
  resetCameraSignal?: number;
  /** Simplified rendering for large/global views. */
  simplified?: boolean;
}

const Graph3D = memo(function Graph3D({
  nodes,
  links,
  onNodeClick,
  viewNodeId,
  onEnterView,
  filtered,
  selectedId: localSelectedId,
  resetCameraSignal,
  simplified,
}: Graph3DProps) {
  const fgRef = useRef<any>(null);
  const selectedIdRef = useRef<string | null>(null);
  const multiIdsRef = useRef<Set<string>>(new Set());
  const highlightedIdsRef = useRef<Set<string>>(new Set());
  const clusterModeRef = useRef<boolean>(false);
  const nebulaModeRef = useRef<boolean>(false);
  const contentClusterMapRef = useRef<Map<string, import('@/lib/types').ContentCluster>>(new Map());
  const degreeMapRef = useRef<Map<string, number>>(new Map());
  const pathHighlightNodeIdsRef = useRef<Set<string>>(new Set());
  const pathHighlightLinkIdsRef = useRef<Set<string>>(new Set());
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean } | null>(null);

  useEffect(() => {
    const state = useGraphStore.getState();
    selectedIdRef.current = localSelectedId ?? state.selectedNodeId;
    multiIdsRef.current = state.multiSelectedIds;
    highlightedIdsRef.current = state.highlightedNodeIds;
    clusterModeRef.current = false;
    nebulaModeRef.current = state.nebulaMode;
    contentClusterMapRef.current = buildNodeClusterMap(state.contentClusters);
    fgRef.current?.refresh();

    const unsubscribe = useGraphStore.subscribe((state) => {
      let changed = false;
      const nextSelectedId = localSelectedId ?? state.selectedNodeId;
      if (selectedIdRef.current !== nextSelectedId) {
        selectedIdRef.current = nextSelectedId;
        changed = true;
      }
      if (multiIdsRef.current !== state.multiSelectedIds) {
        multiIdsRef.current = state.multiSelectedIds;
        changed = true;
      }
      if (highlightedIdsRef.current !== state.highlightedNodeIds) {
        highlightedIdsRef.current = state.highlightedNodeIds;
        changed = true;
      }
      if (clusterModeRef.current !== state.clusterMode) {
        clusterModeRef.current = state.clusterMode;
        changed = true;
      }
      if (nebulaModeRef.current !== state.nebulaMode) {
        nebulaModeRef.current = state.nebulaMode;
        changed = true;
      }
      const nextContentClusterMap = buildNodeClusterMap(state.contentClusters);
      if (contentClusterMapRef.current !== nextContentClusterMap) {
        contentClusterMapRef.current = nextContentClusterMap;
        changed = true;
      }
      if (pathHighlightNodeIdsRef.current !== state.pathHighlightNodeIds) {
        pathHighlightNodeIdsRef.current = state.pathHighlightNodeIds;
        changed = true;
      }
      if (pathHighlightLinkIdsRef.current !== state.pathHighlightLinkIds) {
        pathHighlightLinkIdsRef.current = state.pathHighlightLinkIds;
        changed = true;
      }
      if (changed) {
        fgRef.current?.refresh();
      }
    });
    return unsubscribe;
  }, [localSelectedId]);

  const storeViewNodeId = useGraphStore((s) => s.currentViewNodeId);
  const clusterMode = useGraphStore((s) => s.clusterMode);
  const effectiveViewNodeId = viewNodeId ?? storeViewNodeId;

  useMemo(() => {
    const degreeMap = new Map<string, number>();
    for (const l of links) {
      const s = l.source as string;
      const t = l.target as string;
      degreeMap.set(s, (degreeMap.get(s) || 0) + 1);
      degreeMap.set(t, (degreeMap.get(t) || 0) + 1);
    }
    degreeMapRef.current = degreeMap;
  }, [links]);

  const visibleNodes = useMemo(() => {
    if (filtered) return nodes;
    return nodes.filter((n) => (!n.parentId ? effectiveViewNodeId === null : n.parentId === effectiveViewNodeId));
  }, [nodes, effectiveViewNodeId, filtered]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleLinks = useMemo(() => {
    if (filtered) return links;
    return links.filter(
      (l) => visibleNodeIds.has(l.source as string) && visibleNodeIds.has(l.target as string)
    );
  }, [links, visibleNodeIds, filtered]);

  const data = useMemo(() => {
    const graphData = buildGraphData(visibleNodes, visibleLinks);
    const nodeMap = new Map(visibleNodes.map((n) => [n.id, n]));
    return {
      nodes: graphData.nodes,
      links: graphData.links.map((l) => ({
        ...l,
        sourceType: nodeMap.get(l.source as string)?.type,
        targetType: nodeMap.get(l.target as string)?.type,
      })),
    };
  }, [visibleNodes, visibleLinks]);

  useEffect(() => {
    if (fgRef.current && data.nodes.length > 0) {
      // In simplified/global-limited mode we use much stronger repulsion and
      // longer links so that large aggregate/cluster nodes do not overlap.
      if (simplified) {
        fgRef.current.d3Force('charge')?.strength(-600);
        fgRef.current.d3Force('link')?.distance(250);
      } else {
        fgRef.current.d3Force('charge')?.strength(-120);
        fgRef.current.d3Force('link')?.distance(80);
      }
    }
  }, [data.nodes.length, simplified]);

  useEffect(() => {
    if (!fgRef.current || resetCameraSignal === undefined) return;
    const distance = simplified
      ? Math.max(800, data.nodes.length * 120 + 200)
      : Math.max(200, data.nodes.length * 30 + 100);
    fgRef.current.cameraPosition({ x: distance, y: distance, z: distance }, null, 1000);
  }, [resetCameraSignal, data.nodes.length, simplified]);



  const handleClick = useCallback(
    (node: any, event: MouseEvent) => {
      if (!node || !node.id) return;
      const id = node.id as string;

      // Ignore aggregate cluster nodes
      if (id.startsWith('cluster:')) return;

      // Double-click detection: enter the node's sub-network
      const now = Date.now();
      if (lastClickRef.current?.id === id && now - lastClickRef.current.time < 350) {
        lastClickRef.current = null;
        if (onEnterView) {
          onEnterView(id);
        } else {
          useGraphStore.getState().enterNodeView(id);
        }
        return;
      }
      lastClickRef.current = { id, time: now };

      const store = useGraphStore.getState();

      // Path finder mode: first click sets source, second sets target
      if (store.pathFinderActive) {
        if (!store.pathSourceId) {
          store.setPathSourceId(id);
          return;
        }
        if (!store.pathTargetId && id !== store.pathSourceId) {
          store.setPathTargetId(id);
          return;
        }
        return;
      }

      if (event.shiftKey) {
        if (connectSourceId) {
          if (connectSourceId === id) {
            setConnectSourceId(null);
          } else {
            store.addLink({ source: connectSourceId, target: id });
            setConnectSourceId(null);
          }
        } else {
          setConnectSourceId(id);
        }
      } else {
        if (connectSourceId) {
          setConnectSourceId(null);
        }
        // Always select the clicked node and open its info card, unless this
        // instance is controlled by a parent selection (multi-view).
        if (!localSelectedId) {
          store.setSelectedNodeId(id);
          store.openStickyNote(id, event?.clientX, event?.clientY);
        }
        onNodeClick(id, event?.clientX, event?.clientY);
      }
    },
    [onNodeClick, localSelectedId, connectSourceId]
  );

  const menuOpenedAtRef = useRef<number>(0);

  const handleBackgroundClick = useCallback((event: MouseEvent) => {
    // Ignore right-click (button 2) to avoid colliding with the context menu.
    if (event.button === 2) return;
    // Don't call preventDefault() here: it can steal focus from inputs and
    // make the canvas feel unresponsive to keyboard input after UI menus close.
    useGraphStore.getState().clearMultiSelect();
    if (connectSourceId) {
      setConnectSourceId(null);
    }
  }, [connectSourceId]);

  const handleBackgroundContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    menuOpenedAtRef.current = Date.now();
    // Offset the menu so the cursor that opened it doesn't land on the first item.
    setContextMenu({ x: event.clientX + 8, y: event.clientY + 8, visible: true });
  }, []);

  const createNodeAtBackground = useCallback(() => {
    const store = useGraphStore.getState();
    const newNode: GraphNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: '新节点',
      type: 'note',
      description: '',
      x: 0,
      y: 0,
      z: 0,
      parentId: effectiveViewNodeId || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as GraphNode;
    store.addNode(newNode);
    store.setSelectedNodeId(newNode.id);
    store.openStickyNote(newNode.id);
    setContextMenu(null);
  }, [effectiveViewNodeId]);

  const handleNodeDragEnd = useCallback(
    (draggedNode: any) => {
      const store = useGraphStore.getState();
      const draggedId = draggedNode.id as string;
      const px = draggedNode.x as number;
      const py = draggedNode.y as number;
      const pz = draggedNode.z as number;

      // Find the nearest other visible node within a small radius
      let nearestId: string | null = null;
      let nearestDist = Infinity;
      for (const n of visibleNodes) {
        if (n.id === draggedId) continue;
        const dx = (n as any).x - px;
        const dy = (n as any).y - py;
        const dz = (n as any).z - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < nearestDist && dist < 30) {
          nearestDist = dist;
          nearestId = n.id;
        }
      }

      if (nearestId) {
        store.moveNodeToParent(draggedId, nearestId);
      }
    },
    [visibleNodes]
  );

  const nodeColor = useCallback((n: any) => {
    if (n.id === connectSourceId) return '#ec4899';
    if (pathHighlightNodeIdsRef.current.has(n.id)) return '#f59e0b';
    if (n.id === selectedIdRef.current) return '#facc15';
    if (multiIdsRef.current.has(n.id)) return '#22c55e';
    if (highlightedIdsRef.current.has(n.id)) return '#f472b6';
    const heat = contentClusterMapRef.current.get(n.id);
    if (heat) return heat.color;
    return n.color;
  }, [connectSourceId]);

  const nodeVal = useCallback((n: any) => {
    const base = n.val || 4;
    if (pathHighlightNodeIdsRef.current.has(n.id)) return base * 1.5;
    if (n.id === selectedIdRef.current || multiIdsRef.current.has(n.id)) return base * 1.3;
    if (highlightedIdsRef.current.has(n.id)) return base * 1.2;
    return base;
  }, []);

  const isLinkSelected = useCallback((l: any) => {
    const sel = selectedIdRef.current;
    if (!sel) return false;
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return s === sel || t === sel;
  }, []);

  const isPathLink = useCallback((l: any) => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return pathHighlightLinkIdsRef.current.has(`${s}->${t}`) || pathHighlightLinkIdsRef.current.has(`${t}->${s}`);
  }, []);

  const linkColor = useCallback((l: any) => {
    if (isPathLink(l)) return 'rgba(245,158,11,0.9)';
    if (isLinkSelected(l)) return 'rgba(226,232,240,0.85)';
    if (l.color) return l.color;
    if (nebulaModeRef.current) {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      const sc = contentClusterMapRef.current.get(s);
      const tc = contentClusterMapRef.current.get(t);
      if (sc && tc && sc.id === tc.id) return sc.color;
      return 'rgba(71,85,105,0.15)';
    }
    if (clusterModeRef.current) {
      if (l.sourceType && l.targetType && l.sourceType === l.targetType) {
        return typeColor(l.sourceType);
      }
      return 'rgba(71,85,105,0.25)';
    }
    return 'rgba(148,163,184,0.25)';
  }, [isLinkSelected, isPathLink]);

  const linkWidth = useCallback((l: any) => {
    if (isPathLink(l)) return 3;
    if (isLinkSelected(l)) return 2.5;
    if (l.variant === 'cycle') return clusterModeRef.current ? 1.5 : 2.5;
    return clusterModeRef.current ? 0.5 : 1;
  }, [isLinkSelected, isPathLink]);

  const linkLabel = useCallback((l: any) => {
    const parts: string[] = [];
    if (l.label) parts.push(l.label);
    if (l.theme) parts.push(`#${l.theme}`);
    return parts.join(' · ') || '';
  }, []);

  const nodeLabel = useCallback((n: any) => {
    const node = n as GraphNode;
    const items = (node.contentItems || []).slice(0, 3);
    const itemsHtml = items
      .map(
        (ci) => {
          const content = ci.content || '';
          return `<div style="margin:2px 0;padding:2px 0;border-bottom:1px solid #334155;"><b>${ci.title || '未命名'}</b> <span style="color:#94a3b8;">[${ci.type || ''}]</span><br/>${content.slice(0, 80)}${content.length > 80 ? '…' : ''}</div>`;
        }
      )
      .join('');
    const tags = node.metadata?.tags || [];
    return `
      <div style="max-width:260px;background:rgba(15,23,42,0.95);border:1px solid #334155;border-radius:6px;padding:8px;color:#e2e8f0;font-size:12px;">
        <div style="font-weight:bold;margin-bottom:4px;">${node.label || ''}${node.labelEn ? ` <span style="color:#94a3b8;">/ ${node.labelEn}</span>` : ''}</div>
        <div style="color:#94a3b8;margin-bottom:4px;">${node.description || ''}</div>
        ${itemsHtml}
        ${tags.length ? `<div style="margin-top:4px;">${tags.map((t) => `#${t}`).join(' ')}</div>` : ''}
      </div>
    `;
  }, []);

  const nodeThreeObject = useCallback(
    (node: any) => {
      const group = new THREE.Group();
      const isCluster = (node.id || '').startsWith('cluster:');
      const r = (node.val || 4) * gradeMultiplier(node.grade as GraphNode['grade']);
      const segments = simplified ? 8 : 16;

      // In cluster mode, add a soft nebula halo sized by node degree
      if (clusterModeRef.current && !simplified) {
        const degree = degreeMapRef.current.get(node.id as string) || 0;
        const haloRadius = r * (1.8 + degree * 0.25);
        const haloOpacity = Math.min(0.32, 0.08 + degree * 0.035);
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(haloRadius, 20, 20),
          new THREE.MeshBasicMaterial({
            color: node.color,
            transparent: true,
            opacity: haloOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        group.add(halo);
      }

      // Main sphere
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, segments, segments),
        new THREE.MeshBasicMaterial({ color: node.color })
      );
      group.add(mesh);

      // Content-cluster heat halo
      const heat = contentClusterMapRef.current.get(node.id as string);
      if (heat && !simplified) {
        const heatRadius = r * 1.6;
        const heatOpacity = Math.min(0.45, 0.15 + (heat.score ?? 0.5) * 0.3);
        const heatHalo = new THREE.Mesh(
          new THREE.SphereGeometry(heatRadius, 20, 20),
          new THREE.MeshBasicMaterial({
            color: heat.color,
            transparent: true,
            opacity: heatOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        group.add(heatHalo);
      }

      // Selection / highlight ring
      const ringColor =
        node.id === selectedIdRef.current
          ? '#facc15'
          : multiIdsRef.current.has(node.id)
          ? '#22c55e'
          : highlightedIdsRef.current.has(node.id)
          ? '#f472b6'
          : null;

      if (ringColor) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.3, r * 1.5, 32),
          new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide })
        );
        ring.onBeforeRender = function (this: any) {
          this.lookAt(fgRef.current?.camera().position || new THREE.Vector3());
        };
        group.add(ring);
      }

      // Label (hidden in cluster/simplified mode to reduce clutter)
      if (!clusterModeRef.current && !simplified && !isCluster) {
        const sprite = new SpriteText((node.label as string) || '');
        sprite.color = '#e2e8f0';
        sprite.textHeight = 3;
        sprite.position.y = r + 4;
        group.add(sprite);
      }

      // AI generation grade badge (top-right corner)
      if (!isCluster && node.aiGrade) {
        const gradeDef = getAIGradeDefinition(node.aiGrade as string);
        const badgeColor = gradeDef?.color ?? '#facc15';
        const badge = new SpriteText(node.aiGrade as string);
        badge.color = badgeColor;
        badge.textHeight = 2.8;
        badge.position.set(r * 1.05, r * 1.05, r * 1.05);
        group.add(badge);

        // Small halo behind badge for visibility
        const badgeHalo = new THREE.Mesh(
          new THREE.SphereGeometry(r * 0.35, 12, 12),
          new THREE.MeshBasicMaterial({
            color: badgeColor,
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        badgeHalo.position.set(r * 1.05, r * 1.05, r * 1.05);
        group.add(badgeHalo);
      }

      return group;
    },
    [simplified]
  );

  return (
    <div className="relative h-full w-full" onContextMenu={handleBackgroundContextMenu}>
      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        nodeLabel={simplified ? undefined : nodeLabel}
        nodeColor={nodeColor}
        nodeVal={nodeVal}
        nodeRelSize={6}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkLabel={simplified ? undefined : linkLabel}
        linkOpacity={1}
        linkDirectionalArrowLength={(l: any) => {
          if (simplified || clusterMode) return 0;
          return isPathLink(l) ? 5 : isLinkSelected(l) ? 4 : 2.5;
        }}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={(l: any) => {
          if (isPathLink(l)) return 'rgba(245,158,11,0.9)';
          if (isLinkSelected(l)) return 'rgba(226,232,240,0.85)';
          return 'rgba(148,163,184,0.35)';
        }}
        backgroundColor="#020617"
        onNodeClick={handleClick}
        onNodeDragEnd={handleNodeDragEnd}
        onBackgroundClick={handleBackgroundClick}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        warmupTicks={simplified ? 15 : 10}
        cooldownTicks={simplified ? 80 : 50}
      />

      {connectSourceId && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-sm border border-pink-500/50 bg-cosmic-900/90 px-3 py-1.5 text-xs text-pink-300 backdrop-blur-md">
          连接模式：从「{nodes.find((n) => n.id === connectSourceId)?.label || '…'}」Shift+点击目标节点建立关系，或再次点击取消
        </div>
      )}

      {contextMenu?.visible && (
        <>
          {/* Invisible overlay to close menu when clicking outside */}
          <div
            className="fixed inset-0 z-40"
            onMouseDown={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 min-w-[120px] rounded-sm border border-cosmic-700 bg-cosmic-900/95 py-1 shadow-xl backdrop-blur-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onMouseDown={(e) => {
                // Ignore the mouse-down that may immediately follow the contextmenu open.
                if (Date.now() - menuOpenedAtRef.current < 120) return;
                if (e.button !== 0) return;
                createNodeAtBackground();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-cosmic-200 transition-colors hover:bg-cosmic-800"
            >
              添加节点
            </button>
            <button
              onMouseDown={(e) => {
                if (Date.now() - menuOpenedAtRef.current < 120) return;
                if (e.button !== 0) return;
                setContextMenu(null);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-cosmic-400 transition-colors hover:bg-cosmic-800"
            >
              取消
            </button>
          </div>
        </>
      )}
    </div>
  );
}, areEqual);

function areEqual(prev: Graph3DProps, next: Graph3DProps) {
  return (
    prev.nodes === next.nodes &&
    prev.links === next.links &&
    prev.onNodeClick === next.onNodeClick &&
    prev.viewNodeId === next.viewNodeId &&
    prev.onEnterView === next.onEnterView &&
    prev.filtered === next.filtered &&
    prev.selectedId === next.selectedId &&
    prev.resetCameraSignal === next.resetCameraSignal &&
    prev.simplified === next.simplified
  );
}

export default Graph3D;
