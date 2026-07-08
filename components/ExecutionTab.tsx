'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { ExecutionTask, GraphNode } from '@/lib/types';
import { ExecutionGraph2D } from './ExecutionGraph2D';
import { ExecutionContextMenu, ContextMenuState } from './ExecutionContextMenu';
import { listProjects, loadProject } from '@/lib/db';
import { generateId } from '@/lib/graph-utils';
import { parseMarkdownPlan, tasksToMarkdownPlan } from '@/lib/markdown-plan-parser';
import { generateMarkdownPlanFromGraph, generateMarkdownPlanFromGoal, layoutTasksByOrder } from '@/lib/execution-planning';

export function ExecutionTab() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ type: null, x: 0, y: 0 });
  const [showEditor, setShowEditor] = useState(false);
  const [markdown, setMarkdown] = useState('');

  const [planGoal, setPlanGoal] = useState('');
  const [planDeadline, setPlanDeadline] = useState('');
  const [planningGraph, setPlanningGraph] = useState(false);
  const [planningGoal, setPlanningGoal] = useState(false);

  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);

  const tasks = useGraphStore((s) => s.executionTasks);
  const nodes = useGraphStore((s) => s.nodes);
  const clusters = useGraphStore((s) => s.contentClusters);
  const globalReview = useGraphStore((s) => s.globalReview);
  const addTask = useGraphStore((s) => s.addExecutionTask);
  const updateTask = useGraphStore((s) => s.updateExecutionTask);
  const deleteTask = useGraphStore((s) => s.deleteExecutionTask);
  const addNode = useGraphStore((s) => s.addNode);
  const setWorkspace = useGraphStore((s) => s.setWorkspace);

  // Sync markdown from tasks when tasks change (if editor is empty or user explicitly syncs)
  const tasksMarkdown = useMemo(() => tasksToMarkdownPlan(tasks, nodes, clusters), [tasks, nodes, clusters]);

  useEffect(() => {
    let mounted = true;
    setLoadingProjects(true);
    listProjects()
      .then((list) => {
        if (!mounted) return;
        setProjectOptions(list.map((p) => ({ id: p.id, name: p.name })));
      })
      .finally(() => {
        if (mounted) setLoadingProjects(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSyncFromTasks = useCallback(() => {
    setMarkdown(tasksMarkdown);
  }, [tasksMarkdown]);

  const handleSyncToTasks = useCallback(() => {
    const drafts = parseMarkdownPlan(markdown, tasks, nodes, clusters);
    if (drafts.length === 0) {
      alert('未从 Markdown 中解析到任务');
      return;
    }

    // Map drafts to existing tasks by title to preserve IDs
    const titleToExisting = new Map(tasks.map((t) => [t.title.trim(), t]));
    const addedIds: string[] = [];

    // First pass: add/update tasks
    const titleToId = new Map<string, string>();
    for (const d of drafts) {
      const existing = titleToExisting.get(d.title.trim());
      if (existing) {
        updateTask(existing.id, {
          description: d.description,
          startDate: d.startDate,
          endDate: d.endDate,
          status: d.status,
          nodeId: d.nodeId,
          clusterId: d.clusterId,
          deliverables: d.deliverables,
        });
        titleToId.set(d.title.trim(), existing.id);
      } else {
        const id = addTask({
          title: d.title,
          description: d.description,
          startDate: d.startDate,
          endDate: d.endDate,
          importance: 0.5,
          urgency: 0.5,
          difficulty: 0.5,
          risk: 0.3,
          customMetrics: {},
          dependsOn: [],
          learningTools: [],
          deliverables: d.deliverables || [],
          status: d.status,
          nodeId: d.nodeId,
          clusterId: d.clusterId,
        });
        titleToId.set(d.title.trim(), id);
        addedIds.push(id);
      }
    }

    // Second pass: resolve dependencies by title
    for (const d of drafts) {
      const id = titleToId.get(d.title.trim());
      if (!id) continue;
      const deps = (d.dependsOnTitles || [])
        .map((title) => titleToId.get(title.trim()))
        .filter((depId): depId is string => !!depId);
      updateTask(id, { dependsOn: deps });
    }

    alert(`已同步 ${drafts.length} 个任务`);
  }, [markdown, tasks, nodes, clusters, addTask, updateTask]);

  const runAiPlanFromGraph = async () => {
    if (nodes.length === 0) {
      alert('请先在 3D 知识图谱中创建节点和关系');
      return;
    }
    setPlanningGraph(true);
    try {
      const md = await generateMarkdownPlanFromGraph(
        {
          nodes,
          links: useGraphStore.getState().links,
          contentClusters: clusters,
          globalReview,
          existingTasks: tasks,
          goal: planGoal.trim() || undefined,
          deadline: planDeadline || undefined,
        },
        { provider: llmProvider, apiKey: llmApiKey, baseURL: llmBaseUrl, model: llmModel }
      );
      setMarkdown(md);
      setShowEditor(true);
    } catch (err: any) {
      alert('AI 图谱规划失败：' + err.message);
    } finally {
      setPlanningGraph(false);
    }
  };

  const runAiPlanFromGoal = async () => {
    if (!planGoal.trim()) return;
    setPlanningGoal(true);
    try {
      const md = await generateMarkdownPlanFromGoal(
        { goal: planGoal.trim(), deadline: planDeadline || undefined },
        { provider: llmProvider, apiKey: llmApiKey, baseURL: llmBaseUrl, model: llmModel }
      );
      setMarkdown(md);
      setShowEditor(true);
      setPlanGoal('');
    } catch (err: any) {
      alert('AI 目标规划失败：' + err.message);
    } finally {
      setPlanningGoal(false);
    }
  };

  const handleImportProjectTasks = async (projectId: string) => {
    if (!projectId) return;
    try {
      const project = await loadProject(projectId);
      if (!project || !project.executionTasks || project.executionTasks.length === 0) {
        alert('该项目没有可导入的任务');
        return;
      }
      const existingIds = new Set(tasks.map((t) => t.id));
      const idMap = new Map<string, string>();
      const imported = project.executionTasks.map((t) => {
        const newId = existingIds.has(t.id) ? generateId('task') : t.id;
        idMap.set(t.id, newId);
        existingIds.add(newId);
        return { ...t, id: newId };
      });
      for (const t of imported) {
        addTask({
          ...t,
          dependsOn: (t.dependsOn || [])
            .map((depId) => idMap.get(depId))
            .filter((depId): depId is string => !!depId),
          nodeId: t.nodeId && nodes.some((n) => n.id === t.nodeId) ? t.nodeId : undefined,
          clusterId: t.clusterId && clusters.some((c) => c.id === t.clusterId) ? t.clusterId : undefined,
          status: t.status || 'todo',
          customMetrics: t.customMetrics || {},
        });
      }
      alert(`已导入 ${imported.length} 个任务`);
    } catch (err: any) {
      alert('读取项目失败：' + err.message);
    }
  };

  const handleCreateTask = useCallback(
    (position: { x: number; y: number }) => {
      addTask({
        title: '新任务',
        description: '',
        startDate: new Date().toISOString().slice(0, 16),
        endDate: '',
        importance: 0.5,
        urgency: 0.5,
        difficulty: 0.5,
        risk: 0.3,
        customMetrics: {},
        dependsOn: [],
        learningTools: [],
        deliverables: [],
        status: 'todo',
        position,
      });
    },
    [addTask]
  );

  const handleAddKnowledgeNode = useCallback(
    (position: { x: number; y: number }) => {
      const newNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: '新节点',
        type: 'note',
        description: '',
        x: 0,
        y: 0,
        z: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as unknown as GraphNode;
      addNode(newNode);
      setWorkspace('graph');
    },
    [addNode, setWorkspace]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      deleteTask(taskId);
    },
    [deleteTask]
  );

  const handleStatusChange = useCallback(
    (taskId: string, status: ExecutionTask['status']) => {
      updateTask(taskId, { status });
    },
    [updateTask]
  );

  const handleUpdatePosition = useCallback(
    (taskId: string, position: { x: number; y: number }) => {
      updateTask(taskId, { position });
    },
    [updateTask]
  );

  const handleUpdateDependency = useCallback(
    (taskId: string, dependsOn: string[]) => {
      updateTask(taskId, { dependsOn });
    },
    [updateTask]
  );

  const handleStartConnect = useCallback((taskId: string) => {
    alert('请直接拖拽源节点的连接点连接到目标节点，或点击目标节点建立依赖');
  }, []);

  const handleJumpToNode = useCallback(
    (nodeId: string) => {
      setWorkspace('graph');
      const store = useGraphStore.getState();
      store.setSelectedNodeId(nodeId);
      store.openStickyNote(nodeId);
    },
    [setWorkspace]
  );

  const handleExportMarkdown = () => {
    const md = markdown || tasksMarkdown;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `执行计划-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportMarkdown = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const md = reader.result as string;
      setMarkdown(md);
      setShowEditor(true);
      const drafts = parseMarkdownPlan(md, tasks, nodes, clusters);
      if (drafts.length > 0) {
        if (confirm(`解析到 ${drafts.length} 个任务，是否立即同步到 2D 图？`)) {
          // Use a small timeout to ensure state is updated
          setTimeout(() => handleSyncToTasks(), 0);
        }
      } else {
        alert('未解析到任务');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          value={planGoal}
          onChange={(e) => setPlanGoal(e.target.value)}
          placeholder="可选：输入目标或约束…"
          className="cosmic-input flex-1 min-w-[140px] text-xs"
        />
        <input
          type="datetime-local"
          value={planDeadline}
          onChange={(e) => setPlanDeadline(e.target.value)}
          className="cosmic-input w-36 text-xs"
        />
        <button
          onClick={runAiPlanFromGraph}
          disabled={planningGraph}
          className="rounded-sm bg-crimson-700 px-3 py-1 text-[10px] text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
        >
          {planningGraph ? '读取图谱…' : 'AI 图谱规划'}
        </button>
        <button
          onClick={runAiPlanFromGoal}
          disabled={planningGoal || !planGoal.trim()}
          className="rounded-sm border border-crimson-700 bg-crimson-950/30 px-3 py-1 text-[10px] text-crimson-300 transition-colors hover:bg-crimson-900/40 disabled:opacity-50"
        >
          {planningGoal ? '规划中…' : 'AI 目标规划'}
        </button>
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-3 py-1 text-[10px] text-cosmic-300 transition-colors hover:text-cosmic-100"
        >
          {showEditor ? '隐藏文档' : '规划文档'}
        </button>
        <select
          disabled={loadingProjects}
          defaultValue=""
          onChange={(e) => {
            handleImportProjectTasks(e.target.value);
            e.target.value = '';
          }}
          className="cosmic-input w-36 text-xs"
        >
          <option value="">{loadingProjects ? '加载项目…' : '读取项目任务'}</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Markdown editor */}
      {showEditor && (
        <div className="mb-2 flex min-h-[140px] flex-col border border-cosmic-800 bg-cosmic-950/40 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold text-cosmic-500">Markdown 规划文档</span>
            <div className="flex gap-1">
              <button
                onClick={handleSyncFromTasks}
                className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-2 py-0.5 text-[10px] text-cosmic-300 hover:text-cosmic-100"
              >
                从 2D 图同步
              </button>
              <button
                onClick={handleSyncToTasks}
                className="rounded-sm border border-crimson-700 bg-crimson-950/30 px-2 py-0.5 text-[10px] text-crimson-300 hover:bg-crimson-900/40"
              >
                同步到 2D 图
              </button>
              <button
                onClick={handleExportMarkdown}
                className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-2 py-0.5 text-[10px] text-cosmic-300 hover:text-cosmic-100"
              >
                导出 MD
              </button>
              <label className="cursor-pointer rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-2 py-0.5 text-[10px] text-cosmic-300 transition-colors hover:text-cosmic-100">
                导入 MD
                <input type="file" accept=".md" className="hidden" onChange={handleImportMarkdown} />
              </label>
            </div>
          </div>
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="# 项目执行计划\n\n## 阶段一\n1. [ ] 任务标题（开始时间 → 结束时间）\n   - 说明：...\n   - 关联节点：...\n   - 交付物：...\n   - 依赖：..."
            className="min-h-0 flex-1 resize-none bg-transparent p-2 font-mono text-xs text-cosmic-200 outline-none scrollbar-thin"
          />
        </div>
      )}

      {/* Graph */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ExecutionGraph2D
          tasks={tasks}
          nodes={nodes}
          clusters={clusters}
          onPaneContextMenu={(pos) => setContextMenu({ type: 'pane', x: pos.x, y: pos.y })}
          onNodeContextMenu={(taskId, pos) => setContextMenu({ type: 'node', x: pos.x, y: pos.y, taskId })}
          onUpdateTaskPosition={handleUpdatePosition}
          onUpdateTaskDependency={handleUpdateDependency}
          onAddKnowledgeNode={handleAddKnowledgeNode}
        />
      </div>

      <ExecutionContextMenu
        menu={contextMenu}
        tasks={tasks}
        onClose={() => setContextMenu({ type: null, x: 0, y: 0 })}
        onCreateTask={handleCreateTask}
        onAddKnowledgeNode={handleAddKnowledgeNode}
        onDeleteTask={handleDeleteTask}
        onStatusChange={handleStatusChange}
        onStartConnect={handleStartConnect}
        onJumpToNode={handleJumpToNode}
      />
    </div>
  );
}
