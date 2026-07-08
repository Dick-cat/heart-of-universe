'use client';

import { useEffect, useRef } from 'react';
import { ExecutionTask } from '@/lib/types';

export type ContextMenuType = 'pane' | 'node' | null;

export interface ContextMenuState {
  type: ContextMenuType;
  x: number;
  y: number;
  taskId?: string;
}

interface ExecutionContextMenuProps {
  menu: ContextMenuState;
  tasks: ExecutionTask[];
  onClose: () => void;
  onCreateTask?: (position: { x: number; y: number }) => void;
  onAddKnowledgeNode?: (position: { x: number; y: number }) => void;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: ExecutionTask['status']) => void;
  onStartConnect?: (taskId: string) => void;
  onJumpToNode?: (nodeId: string) => void;
}

export function ExecutionContextMenu({
  menu,
  tasks,
  onClose,
  onCreateTask,
  onAddKnowledgeNode,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onStartConnect,
  onJumpToNode,
}: ExecutionContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const task = menu.taskId ? tasks.find((t) => t.id === menu.taskId) : undefined;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (!menu.type) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[70] min-w-[140px] rounded-sm border border-cosmic-700 bg-cosmic-900/95 py-1 shadow-xl backdrop-blur-xl"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.type === 'pane' && (
        <>
          <MenuItem onClick={() => {
            onCreateTask?.({ x: menu.x, y: menu.y });
            onClose();
          }}>
            新建任务
          </MenuItem>
          <MenuItem onClick={() => {
            onAddKnowledgeNode?.({ x: menu.x, y: menu.y });
            onClose();
          }}>
            添加知识节点
          </MenuItem>
        </>
      )}

      {menu.type === 'node' && task && (
        <>
          <MenuItem onClick={() => { onEditTask?.(task.id); onClose(); }}>
            编辑任务
          </MenuItem>
          <MenuItem onClick={() => { onStartConnect?.(task.id); onClose(); }}>
            连接依赖
          </MenuItem>
          <div className="my-1 border-t border-cosmic-800" />
          <MenuItem onClick={() => { onStatusChange?.(task.id, 'todo'); onClose(); }}>
            标记待办
          </MenuItem>
          <MenuItem onClick={() => { onStatusChange?.(task.id, 'doing'); onClose(); }}>
            标记进行中
          </MenuItem>
          <MenuItem onClick={() => { onStatusChange?.(task.id, 'done'); onClose(); }}>
            标记完成
          </MenuItem>
          <MenuItem onClick={() => { onStatusChange?.(task.id, 'blocked'); onClose(); }}>
            标记阻塞
          </MenuItem>
          {task.nodeId && (
            <>
              <div className="my-1 border-t border-cosmic-800" />
              <MenuItem onClick={() => { onJumpToNode?.(task.nodeId!); onClose(); }}>
                跳转到知识节点
              </MenuItem>
            </>
          )}
          <div className="my-1 border-t border-cosmic-800" />
          <MenuItem danger onClick={() => { onDeleteTask?.(task.id); onClose(); }}>
            删除
          </MenuItem>
        </>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${
        danger
          ? 'text-crimson-400 hover:bg-crimson-950/30'
          : 'text-cosmic-200 hover:bg-cosmic-800'
      }`}
    >
      {children}
    </button>
  );
}
