'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '@/hooks/useGraphStore';
import { listProjects, loadProject, deleteProject } from '@/lib/db';
import { Project } from '@/lib/types';
import { generateId } from '@/lib/graph-utils';
import { isElectron, listProjectBackups, readProjectBackup, writeProjectBackup, BackupInfo } from '@/lib/file-backup';
import { parseBibtex, bibEntryToNode, exportNodesToBibtex } from '@/lib/bibtex';
import { exportFocusReport } from '@/lib/focus-report';

export function ProjectPanel() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'manage' | 'import' | 'history'>('manage');
  const [projects, setProjects] = useState<Project[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [projectName, setProjectName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bibInputRef = useRef<HTMLInputElement>(null);

  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const reasoningThreads = useGraphStore((s) => s.reasoningThreads);
  const evidenceItems = useGraphStore((s) => s.evidenceItems);
  const executionTasks = useGraphStore((s) => s.executionTasks);
  const changeLog = useGraphStore((s) => s.changeLog);
  const overviewReport = useGraphStore((s) => s.overviewReport);
  const globalReview = useGraphStore((s) => s.globalReview);
  const contentClusters = useGraphStore((s) => s.contentClusters);
  const nebulaMode = useGraphStore((s) => s.nebulaMode);
  const focusSessions = useGraphStore((s) => s.focusSessions);
  const trainingSession = useGraphStore((s) => s.trainingSession);
  const currentProjectId = useGraphStore((s) => s.currentProjectId);
  const saveCurrentProject = useGraphStore((s) => s.saveCurrentProject);
  const importProject = useGraphStore((s) => s.importProject);
  const importProjectById = useGraphStore((s) => s.importProjectById);
  const newProject = useGraphStore((s) => s.newProject);
  const addNode = useGraphStore((s) => s.addNode);
  const electron = isElectron();

  const refreshProjects = async () => {
    const list = await listProjects();
    setProjects(list);
    if (electron) {
      const backupList = await listProjectBackups();
      setBackups(backupList);
    }
  };

  useEffect(() => {
    if (expanded) refreshProjects();
  }, [expanded, electron]);

  const buildCurrentProject = (name: string): Project => ({
    id: currentProjectId || `export-${Date.now()}`,
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
    globalReview: globalReview || undefined,
    contentClusters,
    nebulaMode,
  });

  const handleSave = async () => {
    const name = projectName.trim() || t('projectPanel.defaultProjectName', { date: new Date().toLocaleString() });
    await saveCurrentProject(name);
    setProjectName('');
    await refreshProjects();
  };

  const handleExport = async () => {
    const name = projectName.trim() || t('projectPanel.defaultExportName', { timestamp: Date.now() });
    const project = buildCurrentProject(name);
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    if (electron) {
      await writeProjectBackup(name, project);
      await refreshProjects();
    }
  };

  const handleBackup = async () => {
    const name = projectName.trim() || t('projectPanel.manualBackupName', { timestamp: Date.now() });
    const project = buildCurrentProject(name);
    const path = await writeProjectBackup(name, project);
    if (path) alert(t('projectPanel.backupSaved', { path }));
    await refreshProjects();
  };

  const handleRestoreBackup = async (name: string) => {
    if (nodes.length > 0 && !confirm(t('projectPanel.confirmRestoreBackup'))) return;
    const project = await readProjectBackup(name);
    if (project) importProject(project);
    else alert(t('projectPanel.readBackupFailed'));
    await refreshProjects();
  };

  const handleNewProject = () => {
    if (nodes.length > 0 && !confirm(t('projectPanel.confirmNewProject'))) return;
    newProject();
  };

  const handleLoad = async (id: string) => {
    const p = await loadProject(id);
    if (p) importProject(p);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('projectPanel.confirmDeleteProject'))) return;
    await deleteProject(id);
    await refreshProjects();
  };

  const handleImportById = async (id: string) => {
    if (nodes.length > 0 && !confirm(t('projectPanel.confirmImportMerge'))) return;
    await importProjectById(id);
    await refreshProjects();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.nodes && data.links) {
          importProject({
            id: generateId('project'),
            name: data.name || t('projectPanel.importProjectDefault'),
            createdAt: data.createdAt || Date.now(),
            updatedAt: Date.now(),
            nodes: data.nodes,
            links: data.links,
            executionTasks: data.executionTasks || [],
            reasoningThreads: data.reasoningThreads || [],
            evidenceItems: data.evidenceItems || [],
            changeLog: data.changeLog || [],
            overviewReport: data.overviewReport || '',
            globalReview: data.globalReview,
            contentClusters: data.contentClusters || [],
            nebulaMode: data.nebulaMode || false,
          } as Project);
        }
      } catch {
        alert(t('projectPanel.fileFormatError'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportBibtex = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const entries = parseBibtex(reader.result as string);
        if (entries.length === 0) {
          alert(t('projectPanel.noBibtexEntries'));
          return;
        }
        let added = 0;
        for (const entry of entries) {
          addNode(bibEntryToNode(entry, generateId));
          added++;
        }
        alert(t('projectPanel.importedPapers', { count: added }));
      } catch (err: any) {
        alert(t('projectPanel.bibtexParseError', { message: err.message || t('common.error') }));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportBibtex = () => {
    const paperNodes = nodes.filter((n) => n.type === 'paper');
    if (paperNodes.length === 0) {
      alert(t('projectPanel.noPaperNodes'));
      return;
    }
    const bibtex = exportNodesToBibtex(paperNodes);
    const blob = new Blob([bibtex], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `references-${new Date().toISOString().slice(0, 10)}.bib`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFocusReport = () => {
    exportFocusReport({ focusSessions, trainingSession, nodes });
  };

  const TabButton = ({ id, label }: { id: typeof activeTab; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex-1 rounded-sm py-1.5 text-[10px] font-medium transition-colors ${
        activeTab === id
          ? 'bg-crimson-700 text-white'
          : 'text-cosmic-400 hover:bg-cosmic-800 hover:text-cosmic-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-3 py-2 text-xs text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100"
      >
        <span className="font-medium">{t('projectPanel.title')}</span>
        <span className="text-cosmic-500">{expanded ? '‹' : '›'}</span>
      </button>

      {expanded && (
        <div className="space-y-3 rounded-sm border border-cosmic-800 bg-panel-elevated p-3">
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={t('projectPanel.placeholder')}
            className="cosmic-input w-full text-xs"
          />

          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleNewProject} className="rounded-sm border border-dashed border-cosmic-600 py-1.5 text-[10px] text-cosmic-400 transition-colors hover:border-crimson-600 hover:text-cosmic-200">
              {t('projectPanel.new')}
            </button>
            <button onClick={handleSave} className="cosmic-btn-primary px-2 py-1.5 text-[10px]">
              {t('projectPanel.save')}
            </button>
            <button onClick={handleExport} className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-1.5 text-[10px] text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100">
              {t('projectPanel.exportJson')}
            </button>
            <button onClick={handleExportBibtex} className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-1.5 text-[10px] text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100">
              {t('projectPanel.exportBibtex')}
            </button>
          </div>

          {electron && (
            <button onClick={handleBackup} className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-1.5 text-[10px] text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100">
              {t('projectPanel.backupLocal')}
            </button>
          )}

          <button onClick={handleExportFocusReport} className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-1.5 text-[10px] text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100">
            {t('projectPanel.exportFocusReport')}
          </button>

          <div className="flex gap-1 rounded-sm border border-cosmic-800 p-1">
            <TabButton id="manage" label={t('projectPanel.tabs.manage')} />
            <TabButton id="import" label={t('projectPanel.tabs.import')} />
            <TabButton id="history" label={t('projectPanel.tabs.history')} />
          </div>

          {activeTab === 'manage' && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-cosmic-500">{t('projectPanel.localBackup')}</div>
              {electron && backups.length > 0 ? (
                <ul className="max-h-28 space-y-1 overflow-y-auto scrollbar-thin">
                  {backups.map((b) => (
                    <li key={b.path} className="flex items-center justify-between rounded-sm border border-cosmic-800 bg-cosmic-900/60 px-2 py-1.5 text-xs">
                      <span className="truncate text-cosmic-300">{b.name}</span>
                      <button onClick={() => handleRestoreBackup(b.name)} className="text-crimson-400 hover:text-crimson-300">{t('projectPanel.actions.restore')}</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-cosmic-600">{t('projectPanel.noLocalBackup')}</div>
              )}

              <div className="text-[10px] font-bold uppercase tracking-wider text-cosmic-500">{t('projectPanel.importMerge')}</div>
              {projects.length === 0 ? (
                <div className="text-xs text-cosmic-600">{t('projectPanel.noOtherProjects')}</div>
              ) : (
                <ul className="max-h-28 space-y-1 overflow-y-auto scrollbar-thin">
                  {projects.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-sm border border-cosmic-800 bg-cosmic-900/60 px-2 py-1.5 text-xs">
                      <span className="truncate text-cosmic-300">{p.name}</span>
                      <button onClick={() => handleImportById(p.id)} className="text-crimson-400 hover:text-crimson-300">{t('projectPanel.actions.merge')}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-2">
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportJson} />
              <input ref={bibInputRef} type="file" accept=".bib" className="hidden" onChange={handleImportBibtex} />
              <button onClick={() => fileInputRef.current?.click()} className="w-full rounded-sm border border-dashed border-cosmic-600 py-2 text-xs text-cosmic-400 transition-colors hover:border-crimson-600 hover:text-cosmic-200">
                {t('projectPanel.importJson')}
              </button>
              <button onClick={() => bibInputRef.current?.click()} className="w-full rounded-sm border border-dashed border-cosmic-600 py-2 text-xs text-cosmic-400 transition-colors hover:border-crimson-600 hover:text-cosmic-200">
                {t('projectPanel.importBibtex')}
              </button>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-cosmic-500">{t('projectPanel.historyProjects')}</div>
              {projects.length === 0 ? (
                <div className="text-xs text-cosmic-600">{t('projectPanel.noHistory')}</div>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto scrollbar-thin">
                  {projects.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-sm border border-cosmic-800 bg-cosmic-900/60 px-2 py-1.5 text-xs">
                      <span className="truncate text-cosmic-300">{p.name}</span>
                      <div className="flex gap-2">
                        <button onClick={() => handleLoad(p.id)} className="text-crimson-400 hover:text-crimson-300">{t('projectPanel.actions.load')}</button>
                        <button onClick={() => handleDelete(p.id)} className="text-cosmic-500 hover:text-crimson-400">{t('projectPanel.actions.delete')}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
