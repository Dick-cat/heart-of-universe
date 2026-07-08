import { useEffect, useRef } from 'react';
import { useGraphStore } from './useGraphStore';
import { saveProject } from '@/lib/db';
import { isElectron, writeProjectBackup } from '@/lib/file-backup';

const AUTOSAVE_INTERVAL_MS = 10_000;
const FILE_BACKUP_INTERVAL_MS = 60_000;

export function useAutoSave() {
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const reasoningThreads = useGraphStore((s) => s.reasoningThreads);
  const evidenceItems = useGraphStore((s) => s.evidenceItems);
  const executionTasks = useGraphStore((s) => s.executionTasks);
  const changeLog = useGraphStore((s) => s.changeLog);
  const overviewReport = useGraphStore((s) => s.overviewReport);
  const currentProjectId = useGraphStore((s) => s.currentProjectId);
  const setCurrentProjectId = useGraphStore((s) => s.setCurrentProjectId);
  const hydrated = useGraphStore((s) => s.hydrated);

  const lastSavedRef = useRef<string>('');
  const lastFileBackupRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildProject = (name: string) => ({
    id: currentProjectId || `autosave-${Date.now()}`,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes,
    links,
    reasoningThreads,
    evidenceItems,
    executionTasks,
    changeLog,
    overviewReport,
  });

  useEffect(() => {
    if (!hydrated) return;
    const snapshot = JSON.stringify({ nodes, links, reasoningThreads, evidenceItems, executionTasks, changeLog, overviewReport });
    if (snapshot === lastSavedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const name = currentProjectId ? undefined : '自动保存项目';
        const id = await saveProject(
          name || '自动保存项目',
          nodes,
          links,
          { reasoningThreads, evidenceItems, executionTasks, changeLog, overviewReport },
          currentProjectId || undefined
        );
        if (!currentProjectId) {
          setCurrentProjectId(id);
        }
        lastSavedRef.current = snapshot;
      } catch {
        // ignore auto-save errors
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [nodes, links, reasoningThreads, evidenceItems, executionTasks, changeLog, overviewReport, currentProjectId, hydrated, setCurrentProjectId]);

  // File-based backup for Electron: survives browser storage corruption/crashes.
  useEffect(() => {
    if (!hydrated || !isElectron() || nodes.length === 0) return;
    const snapshot = JSON.stringify({ nodes, links, reasoningThreads, evidenceItems, executionTasks, changeLog, overviewReport });
    if (snapshot === lastFileBackupRef.current) return;

    if (fileBackupTimerRef.current) clearTimeout(fileBackupTimerRef.current);
    fileBackupTimerRef.current = setTimeout(async () => {
      try {
        const name = currentProjectId ? `自动备份-${currentProjectId.slice(0, 8)}` : '自动备份-未命名项目';
        await writeProjectBackup(name, buildProject(name));
        lastFileBackupRef.current = snapshot;
      } catch {
        // ignore backup errors
      }
    }, FILE_BACKUP_INTERVAL_MS);

    return () => {
      if (fileBackupTimerRef.current) clearTimeout(fileBackupTimerRef.current);
    };
  }, [nodes, links, reasoningThreads, evidenceItems, executionTasks, changeLog, overviewReport, currentProjectId, hydrated]);
}
