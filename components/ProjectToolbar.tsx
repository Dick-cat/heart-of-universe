'use client';

import { useState, useEffect, useRef } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { listProjects, loadProject, deleteProject } from '@/lib/db';
import { Project } from '@/lib/types';
import { generateId } from '@/lib/graph-utils';
import { isElectron, listProjectBackups, readProjectBackup, writeProjectBackup, BackupInfo } from '@/lib/file-backup';
import { parseBibtex, bibEntryToNode, exportNodesToBibtex } from '@/lib/bibtex';
import { exportFocusReport } from '@/lib/focus-report';

export function ProjectToolbar() {
  const [showMenu, setShowMenu] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [projectName, setProjectName] = useState('');
  const [quickNodeLabel, setQuickNodeLabel] = useState('');
  const toggleRef = useRef<HTMLButtonElement>(null);
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
  const workspace = useGraphStore((s) => s.workspace);
  const focusSessions = useGraphStore((s) => s.focusSessions);
  const trainingSession = useGraphStore((s) => s.trainingSession);
  const currentProjectId = useGraphStore((s) => s.currentProjectId);
  const saveCurrentProject = useGraphStore((s) => s.saveCurrentProject);
  const importProject = useGraphStore((s) => s.importProject);
  const importProjectById = useGraphStore((s) => s.importProjectById);
  const newProject = useGraphStore((s) => s.newProject);
  const setWorkspace = useGraphStore((s) => s.setWorkspace);
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

  const handleSave = async () => {
    const name = projectName.trim() || `项目 ${new Date().toLocaleString()}`;
    await saveCurrentProject(name);
    setProjectName('');
    await refreshProjects();
  };

  const handleLoad = async (id: string) => {
    const p = await loadProject(id);
    if (p) importProject(p);
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    await refreshProjects();
  };

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

  const handleExport = async () => {
    const name = projectName.trim() || `heart-of-universe-${Date.now()}`;
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
    const name = projectName.trim() || `手动备份-${Date.now()}`;
    const project = buildCurrentProject(name);
    const path = await writeProjectBackup(name, project);
    if (path) {
      alert(`已备份到: ${path}`);
    }
    await refreshProjects();
  };

  const handleRestoreBackup = async (name: string) => {
    if (nodes.length > 0 && !confirm('恢复备份将覆盖当前图谱，确定继续吗？')) return;
    const project = await readProjectBackup(name);
    if (project) {
      importProject(project);
      setShowMenu(false);
    } else {
      alert('读取备份失败');
    }
  };

  const handleNewProject = () => {
    if (nodes.length > 0 && !confirm('新建项目将清空当前图谱，确定继续吗？')) return;
    newProject();
    setShowMenu(false);
    // Restore focus to the toggle button so the user can continue keyboard navigation.
    setTimeout(() => toggleRef.current?.focus(), 0);
  };

  const handleQuickAddNode = () => {
    if (!quickNodeLabel.trim()) return;
    addNode({ label: quickNodeLabel.trim(), type: 'concept', description: '' });
    setQuickNodeLabel('');
  };

  const handleImportById = async (id: string) => {
    if (nodes.length > 0 && !confirm('导入会合并另一个项目的节点和关系到当前项目，确定继续吗？')) return;
    await importProjectById(id);
    setShowMenu(false);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.nodes && data.links) {
          importProject({
            id: generateId('project'),
            name: data.name || '导入项目',
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
        alert('文件格式错误');
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
          alert('未解析到 BibTeX 条目');
          return;
        }
        let added = 0;
        for (const entry of entries) {
          const node = bibEntryToNode(entry, generateId);
          addNode(node);
          added++;
        }
        alert(`已导入 ${added} 条文献为知识节点`);
        setShowMenu(false);
      } catch (err: any) {
        alert('BibTeX 解析失败：' + (err.message || '未知错误'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportBibtex = () => {
    const paperNodes = nodes.filter((n) => n.type === 'paper');
    if (paperNodes.length === 0) {
      alert('当前没有 paper 类型的节点可导出');
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
    setShowMenu(false);
  };

  const handleExportFocusReport = () => {
    exportFocusReport({ focusSessions, trainingSession, nodes });
    setShowMenu(false);
  };

  return (
    <div className="absolute left-4 top-14 z-30">
      <div className="flex items-center gap-2">
        <button
          ref={toggleRef}
          onClick={() => {
            setShowMenu(!showMenu);
            if (!showMenu) refreshProjects();
          }}
          className="rounded-sm border border-cosmic-700 bg-cosmic-800/80 px-4 py-2 text-sm font-medium text-cosmic-200 shadow-crimson-glow backdrop-blur-md transition-all hover:border-crimson-600 hover:text-white"
        >
          项目
        </button>
        <div className="flex items-center gap-1 rounded-sm border border-cosmic-700 bg-cosmic-800/80 p-1 backdrop-blur-md">
          <input
            value={quickNodeLabel}
            onChange={(e) => setQuickNodeLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickAddNode()}
            placeholder="输入节点名称…"
            className="w-36 bg-transparent px-2 py-1 text-xs text-cosmic-200 outline-none placeholder:text-cosmic-500"
          />
          <button
            onClick={handleQuickAddNode}
            className="rounded-sm bg-crimson-700 px-2 py-1 text-xs text-white transition-colors hover:bg-crimson-600"
          >
            + 节点
          </button>
        </div>
      </div>

      {showMenu && (
        <div className="mt-2 w-80 rounded-none border border-cosmic-700 bg-cosmic-900/95 p-4 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'graph', label: '3D 知识图谱' },
                { key: 'execution', label: '2D 执行图' },
                { key: 'reasoning', label: '推理工作区' },
              ].map((w) => (
                <button
                  key={w.key}
                  onClick={() => {
                    setWorkspace(w.key as 'graph' | 'execution' | 'reasoning');
                    setShowMenu(false);
                  }}
                  className={`rounded-sm py-2 text-[10px] font-medium transition-colors ${
                    workspace === w.key
                      ? 'bg-crimson-700 text-white'
                      : 'border border-cosmic-700 bg-cosmic-800/60 text-cosmic-300 hover:border-crimson-700 hover:text-cosmic-100'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleNewProject}
              className="w-full rounded-sm border border-dashed border-cosmic-600 py-2 text-xs text-cosmic-400 transition-colors hover:border-crimson-600 hover:text-cosmic-200"
            >
              + 新建空白项目
            </button>
            <div className="flex gap-2">
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="项目名称"
                className="cosmic-input flex-1 text-xs"
              />
              <button onClick={handleSave} className="cosmic-btn-primary px-3 text-xs">
                保存
              </button>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer rounded-sm border border-dashed border-cosmic-600 py-2 text-center text-xs text-cosmic-400 transition-colors hover:border-crimson-600 hover:text-cosmic-200">
                导入 JSON
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>
              <button onClick={handleExport} className="flex-1 rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-xs text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100">
                导出 JSON
              </button>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer rounded-sm border border-dashed border-cosmic-600 py-2 text-center text-xs text-cosmic-400 transition-colors hover:border-crimson-600 hover:text-cosmic-200">
                导入 BibTeX
                <input type="file" accept=".bib" className="hidden" onChange={handleImportBibtex} />
              </label>
              <button onClick={handleExportBibtex} className="flex-1 rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-xs text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100">
                导出 BibTeX
              </button>
            </div>
            {electron && (
              <button
                onClick={handleBackup}
                className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-xs text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100"
              >
                备份到本地文件
              </button>
            )}
            <button
              onClick={handleExportFocusReport}
              className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-xs text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100"
            >
              导出专注与学习报告
            </button>
          </div>

          {electron && backups.length > 0 && (
            <div className="border-t border-panel-border/60 pt-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cosmic-500">本地备份</div>
              <ul className="max-h-32 space-y-1 overflow-y-auto scrollbar-thin">
                {backups.map((b) => (
                  <li
                    key={b.path}
                    className="flex items-center justify-between rounded-sm border border-cosmic-800 bg-panel-elevated px-3 py-2 text-xs"
                  >
                    <span className="truncate text-cosmic-300">{b.name}</span>
                    <button onClick={() => handleRestoreBackup(b.name)} className="text-crimson-400 hover:text-crimson-300">
                      恢复
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-panel-border/60 pt-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cosmic-500">导入并合并</div>
            {projects.length === 0 ? (
              <div className="text-xs text-cosmic-600">暂无其他项目可导入</div>
            ) : (
              <ul className="mb-4 max-h-32 space-y-1 overflow-y-auto scrollbar-thin">
                {projects.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-sm border border-cosmic-800 bg-panel-elevated px-3 py-2 text-xs"
                  >
                    <span className="truncate text-cosmic-300">{p.name}</span>
                    <button
                      onClick={() => handleImportById(p.id)}
                      className="text-crimson-400 hover:text-crimson-300"
                    >
                      合并
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-panel-border/60 pt-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cosmic-500">历史项目</div>
            {projects.length === 0 ? (
              <div className="text-xs text-cosmic-600">暂无历史项目</div>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto scrollbar-thin">
                {projects.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-sm border border-cosmic-800 bg-panel-elevated px-3 py-2 text-xs"
                  >
                    <span className="truncate text-cosmic-300">{p.name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => handleLoad(p.id)} className="text-crimson-400 hover:text-crimson-300">
                        加载
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="text-cosmic-500 hover:text-crimson-400">
                        删
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
