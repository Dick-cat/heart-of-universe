'use client';

import { useMemo, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { ReasoningThread } from '@/lib/types';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

interface ChainNode {
  id: string;
  label: string;
  fx: number;
  fy: number;
  fz: number;
  color: string;
  size: number;
}

interface ChainLink {
  source: string;
  target: string;
}

export function ReasoningChain3D({
  thread,
  onStepClick,
  onEditStep,
  onEditIntervention,
  onEditCounterfactual,
  selectedId,
  large,
}: {
  thread: ReasoningThread;
  onStepClick?: (stepId: string) => void;
  onEditStep?: (stepId: string) => void;
  onEditIntervention?: (stepId: string, idx: number) => void;
  onEditCounterfactual?: (stepId: string, idx: number) => void;
  selectedId?: string | null;
  large?: boolean;
}) {
  const fgRef = useRef<any>(null);

  const { nodes, links } = useMemo(() => {
    const stepSpacing = large ? 38 : 26;
    const sideOffset = large ? 22 : 14;
    const branchSpacing = large ? 16 : 10;

    const stepNodes: ChainNode[] = thread.steps.map((s, i) => ({
      id: s.id,
      label: s.claim.slice(0, large ? 60 : 40),
      fx: 0,
      fy: -i * stepSpacing,
      fz: 0,
      color: s.status === 'approved' ? '#10b981' : s.status === 'rejected' ? '#ef4444' : '#64748b',
      size: large ? 9 : 5,
    }));

    const chainLinks: ChainLink[] = [];
    for (let i = 0; i < thread.steps.length - 1; i++) {
      chainLinks.push({ source: thread.steps[i].id, target: thread.steps[i + 1].id });
    }

    thread.steps.forEach((s, i) => {
      const baseY = -i * stepSpacing;
      s.interventions.forEach((iv, j) => {
        const id = `${s.id}-iv-${j}`;
        stepNodes.push({
          id,
          label: `do(${iv.variable})`,
          fx: sideOffset,
          fy: baseY + (j + 1) * branchSpacing,
          fz: 0,
          color: iv.status === 'confirmed' ? '#10b981' : '#f59e0b',
          size: large ? 5 : 3,
        });
        chainLinks.push({ source: s.id, target: id });
      });
    });

    thread.steps.forEach((s, i) => {
      const baseY = -i * stepSpacing;
      s.counterfactuals.forEach((cf, j) => {
        const id = `${s.id}-cf-${j}`;
        stepNodes.push({
          id,
          label: cf.scenario.slice(0, large ? 50 : 30),
          fx: -sideOffset,
          fy: baseY - (j + 1) * branchSpacing,
          fz: 0,
          color: '#8b5cf6',
          size: large ? 5 : 3,
        });
        chainLinks.push({ source: s.id, target: id });
      });
    });

    return { nodes: stepNodes, links: chainLinks };
  }, [thread, large]);

  // Frame the vertical chain in view.
  useEffect(() => {
    if (!fgRef.current || nodes.length === 0) return;
    const ys = nodes.map((n) => n.fy);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const centerY = (minY + maxY) / 2;
    const range = Math.max(80, maxY - minY);
    const distance = Math.max(180, range * 1.4);
    fgRef.current.cameraPosition({ x: 0, y: centerY, z: distance }, { x: 0, y: centerY, z: 0 }, 0);
  }, [nodes]);

  const nodeThreeObject = useCallback(
    (node: any) => {
      const group = new THREE.Group();
      const r = node.size || 4;
      const segments = large ? 16 : 10;

      // Visible sphere: very faint, almost invisible
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, segments, segments),
        new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.12 })
      );
      group.add(mesh);

      // Invisible larger hit sphere for easier clicking
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(r * 2.2, 12, 12),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      group.add(hit);

      // Selection ring
      if (selectedId && node.id === selectedId) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.5, r * 1.8, 32),
          new THREE.MeshBasicMaterial({ color: '#facc15', side: THREE.DoubleSide })
        );
        ring.onBeforeRender = function (this: any) {
          this.lookAt(fgRef.current?.camera().position || new THREE.Vector3());
        };
        group.add(ring);
      }

      // Label
      const sprite = new SpriteText(node.label as string);
      sprite.color = '#e2e8f0';
      sprite.textHeight = large ? 4 : 2.5;
      sprite.position.y = r + (large ? 6 : 3);
      group.add(sprite);

      return group;
    },
    [large, selectedId]
  );

  const handleClick = (node: any) => {
    const rawId = node.id as string;
    const [stepId, kind, idxStr] = rawId.split('-');
    if (kind === 'iv') {
      onEditIntervention?.(stepId, parseInt(idxStr, 10));
      return;
    }
    if (kind === 'cf') {
      onEditCounterfactual?.(stepId, parseInt(idxStr, 10));
      return;
    }
    onEditStep?.(stepId);
    onStepClick?.(stepId);
  };

  return (
    <div className="relative h-full w-full rounded-sm border border-cosmic-800 bg-cosmic-950/40">
      <ForceGraph3D
        ref={fgRef}
        graphData={{ nodes, links }}
        nodeId="id"
        nodeLabel={(n: any) => n.label}
        nodeColor={() => 'rgba(0,0,0,0)'}
        linkColor={() => 'rgba(148,163,184,0.35)'}
        linkOpacity={1}
        linkDirectionalArrowLength={large ? 3 : 1.5}
        linkDirectionalArrowRelPos={1}
        backgroundColor="#020617"
        onNodeClick={handleClick}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        warmupTicks={0}
        cooldownTicks={0}
        enableNodeDrag={false}
      />
      <div className="pointer-events-none absolute bottom-2 left-2 text-[10px] text-cosmic-500">
        纵向 = 推理链 · 右侧 = 干预 · 左侧 = 反事实 · 点击节点编辑
      </div>
    </div>
  );
}
