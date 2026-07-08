'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { ExecutionTask } from '@/lib/types';
import { NodeDetail } from './NodeDetail';

interface Props {
  note: {
    id: string;
    nodeId?: string;
    task?: ExecutionTask;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
  };
}

export function StickyNote({ note }: Props) {
  const node = useGraphStore((s) => (note.nodeId ? s.nodes.find((n) => n.id === note.nodeId) : undefined));
  const updateStickyNote = useGraphStore((s) => s.updateStickyNote);
  const closeStickyNote = useGraphStore((s) => s.closeStickyNote);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const noteRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, noteX: 0, noteY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const onMouseDownHeader = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, noteX: note.x, noteY: note.y };
  }, [note.x, note.y]);

  const onMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    resizeStart.current = { x: e.clientX, y: e.clientY, width: note.width, height: note.height };
  }, [note.width, note.height]);

  useEffect(() => {
    if (!dragging && !resizing) return;

    const onMouseMove = (e: MouseEvent) => {
      if (dragging) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        updateStickyNote(note.id, {
          x: Math.max(0, dragStart.current.noteX + dx),
          y: Math.max(0, dragStart.current.noteY + dy),
        });
      }
      if (resizing) {
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        updateStickyNote(note.id, {
          width: Math.max(280, resizeStart.current.width + dx),
          height: Math.max(200, resizeStart.current.height + dy),
        });
      }
    };

    const onMouseUp = () => {
      setDragging(false);
      setResizing(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, resizing, note.id, updateStickyNote]);

  if (!node && !note.task) return null;

  const title = node ? node.label : note.task?.title || '任务';
  const subtitle = node ? node.type : note.task?.status;

  return (
    <div
      ref={noteRef}
      onMouseDown={() => note.nodeId && setSelectedNodeId(note.nodeId)}
      className="fixed z-40 flex flex-col rounded-sm border border-cosmic-700 bg-cosmic-900/95 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl"
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.minimized ? 44 : note.height,
      }}
    >
      {/* Header */}
      <div
        className="flex cursor-move items-center justify-between border-b border-cosmic-700 bg-cosmic-950/60 px-3 py-2"
        onMouseDown={onMouseDownHeader}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="truncate text-xs font-bold text-cosmic-200">{title}</span>
          <span className="text-[10px] text-cosmic-500">({subtitle})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => updateStickyNote(note.id, { minimized: !note.minimized })}
            className="flex h-5 w-5 items-center justify-center rounded-sm text-cosmic-400 hover:bg-cosmic-800 hover:text-cosmic-100"
          >
            {note.minimized ? '▲' : '▼'}
          </button>
          <button
            onClick={() => closeStickyNote(note.id)}
            className="flex h-5 w-5 items-center justify-center rounded-sm text-cosmic-400 hover:bg-crimson-900/50 hover:text-crimson-300"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      {!note.minimized && (
        <div className="flex-1 overflow-hidden">
          {note.nodeId ? (
            <NodeDetail nodeId={note.nodeId} />
          ) : note.task ? (
            <TaskDetail task={note.task} />
          ) : null}
        </div>
      )}

      {/* Resize handle */}
      {!note.minimized && (
        <div
          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
          onMouseDown={onMouseDownResize}
        >
          <svg viewBox="0 0 16 16" className="h-full w-full text-cosmic-600">
            <path d="M8 16L16 8v8z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}

function TaskDetail({ task }: { task: ExecutionTask }) {
  const tasks = useGraphStore((s) => s.executionTasks);
  const nodes = useGraphStore((s) => s.nodes);
  const clusters = useGraphStore((s) => s.contentClusters);
  const updateTask = useGraphStore((s) => s.updateExecutionTask);
  const deleteTask = useGraphStore((s) => s.deleteExecutionTask);
  const [form, setForm] = useState({ ...task });

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 text-xs scrollbar-thin">
      <input
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        className="cosmic-input mb-2 w-full"
      />
      <textarea
        value={form.description || ''}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="描述"
        className="cosmic-input mb-2 h-20 w-full resize-none"
      />
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          type="datetime-local"
          value={form.startDate ? new Date(form.startDate).toISOString().slice(0, 16) : ''}
          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          className="cosmic-input"
        />
        <input
          type="datetime-local"
          value={form.endDate ? new Date(form.endDate).toISOString().slice(0, 16) : ''}
          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          className="cosmic-input"
        />
      </div>
      <select
        value={form.status}
        onChange={(e) => setForm({ ...form, status: e.target.value as ExecutionTask['status'] })}
        className="cosmic-input mb-2 w-full"
      >
        <option value="todo">待办</option>
        <option value="doing">进行中</option>
        <option value="done">完成</option>
        <option value="blocked">阻塞</option>
      </select>
      <div className="mb-2 grid grid-cols-2 gap-2 text-cosmic-300">
        <label>
          重要性
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={form.importance ?? 0.5}
            onChange={(e) => setForm({ ...form, importance: parseFloat(e.target.value) })}
            className="w-full"
          />
        </label>
        <label>
          紧急度
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={form.urgency ?? 0.5}
            onChange={(e) => setForm({ ...form, urgency: parseFloat(e.target.value) })}
            className="w-full"
          />
        </label>
      </div>
      <select
        value={form.nodeId || ''}
        onChange={(e) => setForm({ ...form, nodeId: e.target.value || undefined })}
        className="cosmic-input mb-2 w-full"
      >
        <option value="">关联知识节点</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
          </option>
        ))}
      </select>
      <select
        value={form.clusterId || ''}
        onChange={(e) => setForm({ ...form, clusterId: e.target.value || undefined })}
        className="cosmic-input mb-2 w-full"
      >
        <option value="">关联内容区块</option>
        {clusters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        multiple
        value={form.dependsOn || []}
        onChange={(e) => setForm({ ...form, dependsOn: Array.from(e.target.selectedOptions).map((o) => o.value) })}
        className="cosmic-input mb-2 h-20 w-full"
      >
        {tasks
          .filter((t) => t.id !== task.id)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
      </select>
      <div className="mt-auto flex gap-2">
        <button onClick={() => updateTask(task.id, form)} className="cosmic-btn-primary flex-1">
          保存
        </button>
        <button onClick={() => deleteTask(task.id)} className="rounded-sm border border-crimson-800 bg-crimson-950/30 px-3 py-1 text-crimson-400 transition-colors hover:bg-crimson-900/40">
          删除
        </button>
      </div>
    </div>
  );
}
