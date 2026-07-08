import { useEffect } from 'react';
import { useGraphStore } from './useGraphStore';
import { saveProject } from '@/lib/db';

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.matches('input, textarea, select, [contenteditable="true"]') ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      // Never intercept shortcuts while the user is typing in an editable field.
      if (isEditingTarget(e.target)) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        useGraphStore.getState().undo();
        return;
      }

      if (isCtrlOrCmd && e.key.toLowerCase() === 's') {
        e.preventDefault();
        try {
          const state = useGraphStore.getState();
          const id = await saveProject(
            '手动保存项目',
            state.nodes,
            state.links,
            {
              reasoningThreads: state.reasoningThreads,
              evidenceItems: state.evidenceItems,
              executionTasks: state.executionTasks,
              changeLog: state.changeLog,
              overviewReport: state.overviewReport,
            },
            state.currentProjectId || undefined
          );
          if (!state.currentProjectId) state.setCurrentProjectId(id);
          // Could show toast here
        } catch (err) {
          alert('保存失败：' + (err as Error).message);
        }
        return;
      }

      if (e.key === 'Escape') {
        useGraphStore.getState().setSelectedNodeId(null);
        useGraphStore.getState().clearMultiSelect();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
