import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from './useGraphStore';
import { listProjects, loadProject } from '@/lib/db';
import { listProjectBackups, readProjectBackup, isElectron } from '@/lib/file-backup';
import { Project } from '@/lib/types';
import { sanitizeProject } from '@/lib/project-sanitize';

export function useStartupRecovery() {
  const hydrated = useGraphStore((s) => s.hydrated);
  const nodes = useGraphStore((s) => s.nodes);
  const importProject = useGraphStore((s) => s.importProject);
  const [recovered, setRecovered] = useState<Project | null>(null);
  const [candidates, setCandidates] = useState<Project[]>([]);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (nodes.length > 0) return;
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    (async () => {
      let latest: Project | null = null;
      let source = '';

      // 1. Try latest file backup in Electron
      if (isElectron()) {
        try {
          const backups = await listProjectBackups();
          if (backups.length > 0) {
            const backup = await readProjectBackup(backups[0].name);
            if (backup && backup.nodes.length > 0) {
              latest = sanitizeProject(backup);
              source = 'file-backup';
            }
          }
        } catch {
          // ignore
        }
      }

      // 2. Fall back to latest IndexedDB auto-saved project
      if (!latest) {
        try {
          const projects = await listProjects();
          const nonEmpty = projects.filter((p) => p.nodes && p.nodes.length > 0).sort((a, b) => b.updatedAt - a.updatedAt);
          if (nonEmpty.length > 0) {
            latest = sanitizeProject(nonEmpty[0]);
            source = 'indexeddb';
          }
        } catch {
          // ignore
        }
      }

      if (latest) {
        setRecovered(latest);
        setCandidates([]);
        if (source === 'indexeddb' && latest.id) {
          // Full project from IndexedDB includes everything
          const full = await loadProject(latest.id);
          if (full) {
            importProject(sanitizeProject(full));
          } else {
            importProject(latest);
          }
        } else {
          importProject(latest);
        }
      }
    })();
  }, [hydrated, nodes.length, importProject]);

  return { recovered, candidates };
}
