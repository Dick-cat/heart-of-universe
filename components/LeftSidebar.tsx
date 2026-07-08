'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore } from '@/hooks/useGraphStore';
import { GraphNode } from '@/lib/types';
import { typeColor } from '@/lib/graph-utils';
import { getAIGradeColor } from '@/lib/ai-grading';
import { HeartClawLogo } from './HeartClawLogo';
import { ViewPanel } from './ViewPanel';
import { ProjectPanel } from './ProjectPanel';

export function LeftSidebar() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const nodes = useGraphStore((s) => s.nodes);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const highlightedNodeIds = useGraphStore((s) => s.highlightedNodeIds);
  const setHighlightedNodeIds = useGraphStore((s) => s.setHighlightedNodeIds);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setHighlightedNodeIds(new Set());
      return;
    }
    const q = value.toLowerCase();
    const matched = new Set(
      nodes
        .filter(
          (n) =>
            (n.label || '').toLowerCase().includes(q) ||
            (n.labelEn || '').toLowerCase().includes(q) ||
            (n.description || '').toLowerCase().includes(q) ||
            (n.descriptionEn || '').toLowerCase().includes(q) ||
            (n.metadata?.tags || []).some((t) => (t || '').toLowerCase().includes(q)) ||
            (n.contentItems || []).some(
              (ci) =>
                (ci.title || '').toLowerCase().includes(q) ||
                (ci.titleEn || '').toLowerCase().includes(q) ||
                (ci.content || '').toLowerCase().includes(q) ||
                (ci.contentEn || '').toLowerCase().includes(q) ||
                (ci.tags || []).some((t) => (t || '').toLowerCase().includes(q))
            )
        )
        .map((n) => n.id)
    );
    setHighlightedNodeIds(matched);
  };

  return (
    <div className="flex h-full flex-col text-cosmic-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-panel-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <HeartClawLogo size={22} />
          <span className="cosmic-title text-sm font-bold tracking-widest">{t('leftSidebar.navTitle')}</span>
        </div>
        <span className="text-[10px] font-mono text-crimson-400">COSMIC</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin">
        {/* Search */}
        <div className="space-y-2">
          <label className="text-xs font-medium tracking-wider text-cosmic-400">{t('leftSidebar.searchLabel')}</label>
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t('leftSidebar.searchPlaceholder')}
            className="cosmic-input w-full"
          />
          {query && (
            <div className="text-xs text-crimson-400">{t('leftSidebar.matchCount', { count: highlightedNodeIds.size })}</div>
          )}
        </div>

        {/* Project management */}
        <Section title={t('leftSidebar.sections.project')}>
          <ProjectPanel />
        </Section>

        {/* Workspace switcher */}
        <Section title={t('leftSidebar.sections.workspace')}>
          <WorkspaceSwitcher />
        </Section>

        {/* Quick add */}
        <Section title={t('leftSidebar.sections.quickAdd')}>
          <QuickAddNode />
        </Section>

        {/* Multi-level view */}
        <Section title={t('leftSidebar.sections.view')}>
          <ViewPanel />
        </Section>

        {/* Multi-window */}
        <Section title={t('leftSidebar.sections.multiWindow')}>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).electronAPI?.openWindow) {
                (window as any).electronAPI.openWindow();
              } else {
                window.open('/', '_blank', 'width=1400,height=900');
              }
            }}
            className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-sm font-medium text-cosmic-200 transition-all hover:border-crimson-700 hover:text-cosmic-100"
          >
            {t('leftSidebar.openNewWindow')}
          </button>
        </Section>

        {/* Legend */}
        <Section title={t('leftSidebar.sections.legend')}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(
              [
                'concept',
                'principle',
                'meta',
                'paper',
                'communication',
                'ai-brief',
                'note',
                'custom',
              ] as GraphNode['type'][]
            ).map((t) => (
              <div key={t} className="flex items-center gap-2 text-xs text-cosmic-300">
                <span className="h-2.5 w-2.5 rounded-full shadow-[0_0_6px_currentColor]" style={{ backgroundColor: typeColor(t), color: typeColor(t) }} />
                <span><TypeLabel type={t} /></span>
              </div>
            ))}
          </div>
          <div className="border-t border-panel-border/60 pt-2">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cosmic-500">{t('leftSidebar.aiGradeLegend')}</div>
            <div className="space-y-1.5">
              {(['Ⅰ', 'Ⅱ', 'Ⅲ'] as const).map((grade) => (
                <div key={grade} className="flex items-start gap-2 text-xs text-cosmic-300">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold" style={{ backgroundColor: `${getAIGradeColor(grade)}22`, color: getAIGradeColor(grade) }}>
                    {grade}
                  </span>
                  <div>
                    <div className="font-medium text-cosmic-200">{t(`aiGrades.${grade}.label`)}</div>
                    <div className="text-[10px] text-cosmic-500">{t(`aiGrades.${grade}.description`)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Selected mini info */}
        {selectedNodeId && (
          <div className="rounded-sm border border-crimson-900/50 bg-crimson-950/20 p-3 text-xs">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-crimson-400">{t('leftSidebar.selectedNode')}</div>
            <div className="font-medium text-cosmic-100">{nodes.find((n) => n.id === selectedNodeId)?.label}</div>
          </div>
        )}

        {/* Help */}
        <Section title={t('leftSidebar.sections.help')}>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-xs text-cosmic-300 hover:border-crimson-700 hover:text-cosmic-100"
          >
            {showHelp ? t('leftSidebar.helpToggleHide') : t('leftSidebar.helpToggleShow')}
          </button>
          {showHelp && (
            <div className="space-y-2 rounded-sm border border-panel-border bg-panel-elevated p-3 text-xs leading-relaxed text-cosmic-300">
              <p className="font-medium text-cosmic-100">{t('leftSidebar.helpTitle')}</p>
              <p>{t('leftSidebar.helpDesc')}</p>
              <div className="space-y-1 border-t border-cosmic-800 pt-2 text-cosmic-400">
                <div>{t('leftSidebar.helpContact')}</div>
                <div>{t('leftSidebar.helpBiz')}</div>
              </div>
              <p className="text-cosmic-500">{t('leftSidebar.helpOps')}</p>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const workspace = useGraphStore((s) => s.workspace);
  const setWorkspace = useGraphStore((s) => s.setWorkspace);

  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { key: 'graph', label: t('leftSidebar.workspaces.graph') },
        { key: 'execution', label: t('leftSidebar.workspaces.execution') },
        { key: 'reasoning', label: t('leftSidebar.workspaces.reasoning') },
      ].map((w) => (
        <button
          key={w.key}
          onClick={() => setWorkspace(w.key as 'graph' | 'execution' | 'reasoning')}
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
  );
}

function QuickAddNode() {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const addNode = useGraphStore((s) => s.addNode);

  const handleAdd = () => {
    if (!label.trim()) return;
    addNode({ label: label.trim(), type: 'concept', description: '' });
    setLabel('');
  };

  return (
    <div className="flex items-center gap-1 rounded-sm border border-cosmic-700 bg-cosmic-800/60 p-1">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        placeholder={t('leftSidebar.quickAddPlaceholder')}
        className="flex-1 bg-transparent px-2 py-1 text-xs text-cosmic-200 outline-none placeholder:text-cosmic-500"
      />
      <button
        onClick={handleAdd}
        className="rounded-sm bg-crimson-700 px-2 py-1 text-xs text-white transition-colors hover:bg-crimson-600"
      >
        {t('leftSidebar.quickAddButton')}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-panel-border/60 pt-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-cosmic-500">{title}</div>
      {children}
    </div>
  );
}

function TypeLabel({ type }: { type: GraphNode['type'] }) {
  const { t } = useTranslation();
  const key = type === 'ai-brief' ? 'aiBrief' : type;
  return <>{t(`nodeTypes.${key}` as const)}</>;
}
