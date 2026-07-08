'use client';

import { useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  Node,
  Edge,
  Connection,
  Handle,
  Position,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ExecutionTask, GraphNode, ContentCluster } from '@/lib/types';
import { useGraphStore } from '@/hooks/useGraphStore';
import { suggestTaskDependencies } from '@/lib/ai-grading';

interface ExecutionGraph2DProps {
  tasks: ExecutionTask[];
  nodes?: GraphNode[];
  clusters?: ContentCluster[];
  selectedTaskId?: string | null;
  onPaneContextMenu?: (position: { x: number; y: number }) => void;
  onNodeContextMenu?: (taskId: string, position: { x: number; y: number }) => void;
  onUpdateTaskPosition?: (taskId: string, position: { x: number; y: number }) => void;
  onUpdateTaskDependency?: (taskId: string, dependsOn: string[]) => void;
  onAddKnowledgeNode?: (position: { x: number; y: number }) => void;
}

const DAY_MS = 86400000;

function statusColor(status: ExecutionTask['status']): string {
  switch (status) {
    case 'done':
      return '#10b981';
    case 'doing':
      return '#f59e0b';
    case 'blocked':
      return '#ef4444';
    default:
      return '#64748b';
  }
}

function statusLabel(status: ExecutionTask['status']): string {
  const map = { todo: '待办', doing: '进行中', done: '完成', blocked: '阻塞' };
  return map[status];
}

function parseDate(d: string | undefined): number {
  if (!d) return Date.now();
  const t = new Date(d).getTime();
  return isNaN(t) ? Date.now() : t;
}

/** Workload score drives node size. Combines difficulty, risk and deliverables. */
function taskWorkload(t: ExecutionTask): number {
  const difficulty = t.difficulty ?? 0.5;
  const risk = t.risk ?? 0.5;
  const deliverables = t.deliverables?.length ?? 0;
  const descriptionWeight = Math.min(1, (t.description?.length ?? 0) / 500);
  const score = 0.6 + difficulty * 0.6 + risk * 0.6 + deliverables * 0.15 + descriptionWeight * 0.3;
  return Math.max(0.5, Math.min(2.2, score));
}

/** Priority score drives node color. Based solely on importance and urgency. */
function taskPriority(t: ExecutionTask): number {
  return Math.min(1, (t.importance + t.urgency) / 2);
}

/** Return a color for a priority value (0 = calm blue, 0.5 = amber, 1 = crimson). */
function priorityColor(priority: number): string {
  if (priority < 0.35) return '#06b6d4'; // cyan
  if (priority < 0.6) return '#f59e0b'; // amber
  if (priority < 0.8) return '#f97316'; // orange
  return '#dc2626'; // crimson
}

function taskSize(t: ExecutionTask): { width: number; height: number } {
  const workload = taskWorkload(t);
  return {
    width: Math.max(140, Math.min(300, 160 * workload)),
    height: Math.max(80, Math.min(170, 95 * workload)),
  };
}

function computeLayout(tasks: ExecutionTask[]): Map<string, { x: number; y: number }> {
  const positioned = tasks.filter((t) => t.position);
  const unpositioned = tasks.filter((t) => !t.position);

  const positions = new Map<string, { x: number; y: number }>();
  for (const t of positioned) {
    positions.set(t.id, t.position!);
  }

  if (unpositioned.length === 0) return positions;

  const taskMap = new Map(unpositioned.map((t) => [t.id, t]));
  const inDegree = new Map(unpositioned.map((t) => [t.id, 0]));
  const dependents = new Map(unpositioned.map((t) => [t.id, [] as string[]]));

  for (const t of unpositioned) {
    for (const dep of t.dependsOn || []) {
      if (taskMap.has(dep)) {
        inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
        dependents.get(dep)!.push(t.id);
      }
    }
  }

  // Layered layout based on dependency depth
  const levels: string[][] = [];
  let queue = unpositioned.filter((t) => (inDegree.get(t.id) || 0) === 0).map((t) => t.id);

  while (queue.length > 0) {
    levels.push([...queue]);
    const nextQueue: string[] = [];
    for (const id of queue) {
      for (const dep of dependents.get(id) || []) {
        inDegree.set(dep, (inDegree.get(dep) || 0) - 1);
        if (inDegree.get(dep) === 0) nextQueue.push(dep);
      }
    }
    queue = nextQueue;
  }

  // Handle dependency cycles: append remaining tasks to the last layer
  const placed = new Set(levels.flat());
  const remaining = unpositioned.filter((t) => !placed.has(t.id));
  if (remaining.length > 0) levels.push(remaining.map((t) => t.id));

  // Time range for horizontal axis
  const starts = unpositioned.map((t) => parseDate(t.startDate));
  const minStart = Math.min(...starts);
  const maxStart = Math.max(...starts);
  const timeRange = Math.max(DAY_MS, maxStart - minStart);

  const LEVEL_HEIGHT = 220;
  const ROW_HEIGHT = 140;
  const PADDING_X = 40;
  const MAX_ROW_WIDTH = 1400;

  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const levelTasks = levels[levelIdx]
      .map((id) => taskMap.get(id)!)
      .sort((a, b) => {
        const dateDiff = parseDate(a.startDate) - parseDate(b.startDate);
        if (dateDiff !== 0) return dateDiff;
        const impDiff = (b.importance || 0.5) - (a.importance || 0.5);
        if (impDiff !== 0) return impDiff;
        return (b.urgency || 0.5) - (a.urgency || 0.5);
      });

    // Pack nodes into rows to avoid overlap while preserving time order
    let currentX = 0;
    let row = 0;
    const rowBaseY = levelIdx * LEVEL_HEIGHT;
    for (const t of levelTasks) {
      const timeRatio = (parseDate(t.startDate) - minStart) / timeRange;
      const desiredCenterX = timeRatio * Math.max(800, unpositioned.length * 240);
      const size = taskSize(t);

      // Place at desired time slot but never before the previous node (no overlap)
      let x = Math.max(currentX, desiredCenterX - size.width / 2);

      // Wrap to next row if this node overflows the row
      if (currentX > 0 && x + size.width > MAX_ROW_WIDTH) {
        row++;
        currentX = 0;
        x = Math.max(currentX, desiredCenterX - size.width / 2);
      }

      const y = rowBaseY + row * ROW_HEIGHT;
      positions.set(t.id, { x, y });

      currentX = x + size.width + PADDING_X;
    }
  }

  return positions;
}

function FlowGraphInner({
  tasks,
  nodes: graphNodes,
  clusters,
  selectedTaskId,
  onPaneContextMenu,
  onNodeContextMenu,
  onUpdateTaskPosition,
  onUpdateTaskDependency,
  onAddKnowledgeNode,
}: ExecutionGraph2DProps) {
  const initialLayout = useMemo(() => computeLayout(tasks), [tasks]);
  const hasLayoutedRef = useRef(false);
  const pointerRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Track right-click drag so context menu doesn't fire after panning
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (e.button === 2) {
        pointerRef.current = { x: e.clientX, y: e.clientY, moved: false };
      }
    };
    const handlePointerMove = (e: PointerEvent) => {
      const ref = pointerRef.current;
      if (!ref) return;
      if (Math.hypot(e.clientX - ref.x, e.clientY - ref.y) > 5) {
        ref.moved = true;
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  const nodeMap = useMemo(() => new Map(graphNodes?.map((n) => [n.id, n]) || []), [graphNodes]);
  const clusterMap = useMemo(() => new Map(clusters?.map((c) => [c.id, c]) || []), [clusters]);

  const initialNodes: Node[] = useMemo(
    () =>
      tasks.map((t) => {
        const pos = initialLayout.get(t.id) || { x: 0, y: 0 };
        const linkedNode = t.nodeId ? nodeMap.get(t.nodeId) : undefined;
        const linkedCluster = t.clusterId ? clusterMap.get(t.clusterId) : undefined;
        const size = taskSize(t);
        return {
          id: t.id,
          type: 'task',
          position: pos,
          data: {
            task: t,
            linkedNode,
            linkedCluster,
            selected: t.id === selectedTaskId,
          },
          style: {
            width: size.width,
            height: size.height,
            padding: 0,
            background: 'transparent',
            border: 'none',
          },
        };
      }),
    [tasks, initialLayout, nodeMap, clusterMap, selectedTaskId]
  );

  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    for (const t of tasks) {
      for (const dep of t.dependsOn || []) {
        if (tasks.some((other) => other.id === dep)) {
          edges.push({
            id: `${dep}->${t.id}`,
            source: dep,
            target: t.id,
            type: 'smoothstep',
            animated: t.status === 'doing',
            markerEnd: { type: 'arrowclosed', color: '#64748b' },
            style: { stroke: '#64748b', strokeWidth: 2 },
          });
        }
      }
    }
    return edges;
  }, [tasks]);

  const [rfNodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow();

  // Sync external tasks -> nodes/edges
  useEffect(() => {
    setNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      return tasks.map((t) => {
        const existing = prevMap.get(t.id);
        const pos = existing?.position || initialLayout.get(t.id) || { x: 0, y: 0 };
        const linkedNode = t.nodeId ? nodeMap.get(t.nodeId) : undefined;
        const linkedCluster = t.clusterId ? clusterMap.get(t.clusterId) : undefined;
        const size = taskSize(t);
        return {
          id: t.id,
          type: 'task',
          position: pos,
          data: {
            task: t,
            linkedNode,
            linkedCluster,
            selected: t.id === selectedTaskId,
          },
          style: {
            width: size.width,
            height: size.height,
            padding: 0,
            background: 'transparent',
            border: 'none',
          },
        };
      });
    });
    setEdges(initialEdges);
  }, [tasks, initialLayout, nodeMap, clusterMap, selectedTaskId, setNodes, setEdges, initialEdges]);

  // Silent auto-layout persistence for tasks without position (only once per task set change)
  useEffect(() => {
    if (hasLayoutedRef.current) return;
    const withoutPosition = tasks.filter((t) => !t.position);
    if (withoutPosition.length > 0 && onUpdateTaskPosition) {
      for (const t of withoutPosition) {
        const pos = initialLayout.get(t.id);
        if (pos) onUpdateTaskPosition(t.id, pos);
      }
    }
    hasLayoutedRef.current = true;
  }, [tasks, initialLayout, onUpdateTaskPosition]);

  const handleNodeDragStop = useCallback(
    (_event: any, node: Node) => {
      onUpdateTaskPosition?.(node.id, node.position);
    },
    [onUpdateTaskPosition]
  );

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const ref = pointerRef.current;
      pointerRef.current = null;
      if (ref?.moved) return;
      const clientX = 'clientX' in event ? event.clientX : 0;
      const clientY = 'clientY' in event ? event.clientY : 0;
      const pos = screenToFlowPosition({ x: clientX, y: clientY });
      onPaneContextMenu?.(pos);
    },
    [onPaneContextMenu, screenToFlowPosition]
  );

  const handleNodeContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      const ref = pointerRef.current;
      pointerRef.current = null;
      if (ref?.moved) return;
      const clientX = 'clientX' in event ? event.clientX : 0;
      const clientY = 'clientY' in event ? event.clientY : 0;
      onNodeContextMenu?.(node.id, { x: clientX, y: clientY });
    },
    [onNodeContextMenu]
  );

  const handleNodeClick = useCallback(
    (event: MouseEvent | React.MouseEvent, node: Node) => {
      const task = tasks.find((t) => t.id === node.id);
      if (!task) return;
      const store = useGraphStore.getState();
      if (task.nodeId && store.nodes.some((n) => n.id === task.nodeId)) {
        store.setSelectedNodeId(task.nodeId);
        store.openStickyNote(task.nodeId, 'clientX' in event ? event.clientX : undefined, 'clientY' in event ? event.clientY : undefined);
      } else {
        store.openTaskStickyNote(task, 'clientX' in event ? event.clientX : undefined, 'clientY' in event ? event.clientY : undefined);
      }
    },
    [tasks]
  );

  const handleNodeDoubleClick = useCallback(
    (event: MouseEvent | React.MouseEvent, node: Node) => {
      handleNodeClick(event, node);
    },
    [handleNodeClick]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return;
      const targetTask = tasks.find((t) => t.id === connection.target);
      if (!targetTask) return;
      const deps = new Set(targetTask.dependsOn || []);
      deps.add(connection.source);
      onUpdateTaskDependency?.(connection.target, Array.from(deps));
    },
    [tasks, onUpdateTaskDependency]
  );

  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        const targetTask = tasks.find((t) => t.id === edge.target);
        if (!targetTask) continue;
        const deps = new Set(targetTask.dependsOn || []);
        deps.delete(edge.source);
        onUpdateTaskDependency?.(edge.target, Array.from(deps));
      }
    },
    [tasks, onUpdateTaskDependency]
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={handleNodeDragStop}
      onPaneContextMenu={handlePaneContextMenu}
      onNodeContextMenu={handleNodeContextMenu}
      onNodeClick={handleNodeClick}
      onNodeDoubleClick={handleNodeDoubleClick}
      onConnect={handleConnect}
      onEdgesDelete={handleEdgesDelete}
      nodeTypes={{ task: TaskNode }}
      fitView
      attributionPosition="bottom-left"
      minZoom={0.2}
      maxZoom={2}
      deleteKeyCode={['Backspace', 'Delete']}
      className="execution-flow"
    >
      <Background color="#334155" gap={20} size={1} />
      <Controls className="bg-cosmic-900 text-cosmic-200" />
      <MiniMap
        nodeStrokeWidth={3}
        nodeColor={(n) => statusColor((n.data?.task as ExecutionTask)?.status)}
        className="!bg-cosmic-950/80 !border-cosmic-700"
      />
      <Panel position="top-left" className="m-2 flex flex-wrap gap-1">
        <button
          onClick={() => {
            const md = exportExecutionOrderMarkdown(tasks);
            downloadMarkdown(`执行计划-${new Date().toISOString().slice(0, 10)}.md`, md);
          }}
          className="rounded-sm border border-cosmic-700 bg-cosmic-900/90 px-2 py-1 text-[10px] text-cosmic-300 backdrop-blur-md transition-colors hover:border-crimson-700 hover:text-cosmic-100"
        >
          导出执行顺序
        </button>
        <button
          onClick={() => {
            const md = exportExecutionOrderMarkdown(tasks);
            navigator.clipboard.writeText(md).then(() => alert('已复制 Markdown'));
          }}
          className="rounded-sm border border-cosmic-700 bg-cosmic-900/90 px-2 py-1 text-[10px] text-cosmic-300 backdrop-blur-md transition-colors hover:border-crimson-700 hover:text-cosmic-100"
        >
          复制 Markdown
        </button>
        <button
          onClick={() => {
            const suggestions = suggestTaskDependencies(tasks).filter((s) => s.confidence >= 0.5);
            if (suggestions.length === 0) {
              alert('未检测到足够明确的依赖关系');
              return;
            }
            let added = 0;
            for (const s of suggestions) {
              const target = tasks.find((t) => t.id === s.targetId);
              if (!target) continue;
              const deps = new Set(target.dependsOn || []);
              if (!deps.has(s.sourceId)) {
                deps.add(s.sourceId);
                onUpdateTaskDependency?.(s.targetId, Array.from(deps));
                added++;
              }
            }
            alert(`已自动添加 ${added} 条依赖连线`);
          }}
          className="rounded-sm border border-cosmic-700 bg-cosmic-900/90 px-2 py-1 text-[10px] text-cosmic-300 backdrop-blur-md transition-colors hover:border-crimson-700 hover:text-cosmic-100"
        >
          自动连线
        </button>
      </Panel>
      <Panel position="bottom-right" className="m-2 rounded-sm border border-cosmic-800 bg-cosmic-900/90 p-2 text-[10px] text-cosmic-400 backdrop-blur-md">
        <div className="mb-1 font-medium text-cosmic-300">优先级（重要 + 紧急）</div>
        <div className="space-y-1">
          {[
            { color: '#06b6d4', label: '低' },
            { color: '#f59e0b', label: '中' },
            { color: '#f97316', label: '高' },
            { color: '#dc2626', label: '极高' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </Panel>
      {tasks.length === 0 && (
        <Panel position="top-center" className="text-xs text-cosmic-500">
          右键空白处新建任务/节点，或使用上方 AI 规划
        </Panel>
      )}
    </ReactFlow>
  );
}

export function exportExecutionOrderMarkdown(tasks: ExecutionTask[]): string {
  if (tasks.length === 0) return '# 执行计划\n\n暂无任务。\n';

  // Topological sort by dependencies, fallback to startDate
  const sorted = [...tasks].sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
  const taskMap = new Map(sorted.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const result: ExecutionTask[] = [];

  function visit(t: ExecutionTask) {
    if (visited.has(t.id)) return;
    visited.add(t.id);
    for (const depId of t.dependsOn || []) {
      const dep = taskMap.get(depId);
      if (dep) visit(dep);
    }
    result.push(t);
  }

  for (const t of sorted) visit(t);

  const lines: string[] = ['# 执行计划', ''];
  result.forEach((t, idx) => {
    const statusMark = t.status === 'done' ? '[x]' : '[ ]';
    const dateRange = t.endDate
      ? `${new Date(t.startDate).toLocaleDateString()} → ${new Date(t.endDate).toLocaleDateString()}`
      : new Date(t.startDate).toLocaleDateString();
    lines.push(`${idx + 1}. ${statusMark} ${t.title}（${dateRange}）`);
    if (t.description) lines.push(`   - 说明：${t.description}`);
    if (t.nodeId) lines.push(`   - 关联节点：${t.nodeId}`);
    if (t.deliverables && t.deliverables.length > 0) lines.push(`   - 交付物：${t.deliverables.join('， ')}`);
    if (t.dependsOn && t.dependsOn.length > 0) {
      const depTitles = t.dependsOn.map((id) => taskMap.get(id)?.title).filter(Boolean).join('， ');
      lines.push(`   - 依赖：${depTitles}`);
    }
  });
  lines.push('');
  return lines.join('\n');
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TaskNode({ data }: { data: any }) {
  const task: ExecutionTask = data.task;
  const linkedNode: GraphNode | undefined = data.linkedNode;
  const linkedCluster: ContentCluster | undefined = data.linkedCluster;
  const selected = !!data.selected;
  const priority = taskPriority(task);
  const priColor = priorityColor(priority);
  const workload = taskWorkload(task);

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-sm border text-xs transition-all ${
        selected
          ? 'border-crimson-500 shadow-lg shadow-crimson-900/30'
          : 'border-cosmic-700 hover:border-cosmic-500'
      }`}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: statusColor(task.status),
        background: `linear-gradient(180deg, ${priColor}22 0%, rgba(2,6,23,0.95) 28%)`,
      }}
      title={`优先级 ${Math.round(priority * 100)}% · 工作量 ${workload.toFixed(1)}x`}
    >
      {/* Prominent priority header bar */}
      <div
        className="flex h-5 items-center justify-between px-2 py-1"
        style={{ backgroundColor: priColor }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-black">
          优先级 {Math.round(priority * 100)}%
        </span>
        <span className="text-[10px] font-bold text-black/70">{(task.importance * 100).toFixed(0)}I · {(task.urgency * 100).toFixed(0)}U</span>
      </div>

      <div className="flex flex-1 flex-col p-2">
        <div className="flex items-start justify-between gap-1">
          <div className="line-clamp-2 flex-1 font-medium text-cosmic-100">{task.title}</div>
          <span
            className="shrink-0 rounded-sm px-1 py-0 text-[10px]"
            style={{ backgroundColor: `${statusColor(task.status)}22`, color: statusColor(task.status) }}
          >
            {statusLabel(task.status)}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-cosmic-500">
          {new Date(task.startDate).toLocaleDateString()}
          {task.endDate && ` → ${new Date(task.endDate).toLocaleDateString()}`}
        </div>
        <div className="mt-auto flex flex-wrap gap-1 text-[10px]">
          {linkedNode && <span className="truncate text-cosmic-400">{linkedNode.label}</span>}
          {linkedCluster && (
            <span className="truncate" style={{ color: linkedCluster.color }}>
              #{linkedCluster.label}
            </span>
          )}
        </div>
      </div>
      {/* Connection handles */}
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-cosmic-700 !bg-crimson-500" />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-cosmic-700 !bg-crimson-500" />
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-cosmic-700 !bg-crimson-500" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-cosmic-700 !bg-crimson-500" />
    </div>
  );
}

export function ExecutionGraph2D(props: ExecutionGraph2DProps) {
  return (
    <ReactFlowProvider>
      <FlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
