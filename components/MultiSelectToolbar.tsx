'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';

const PRESET_COLORS = [
  { name: '赤红', value: '#ef4444' },
  { name: '橙金', value: '#f97316' },
  { name: '明黄', value: '#eab308' },
  { name: '翠绿', value: '#22c55e' },
  { name: '青蓝', value: '#06b6d4' },
  { name: '靛紫', value: '#8b5cf6' },
  { name: '玫粉', value: '#ec4899' },
  { name: '灰白', value: '#cbd5e1' },
];

export function MultiSelectToolbar() {
  const [tagInput, setTagInput] = useState('');
  const [themeInput, setThemeInput] = useState('');
  const [showExportColor, setShowExportColor] = useState(false);
  const multiSelectedIds = useGraphStore((s) => s.multiSelectedIds);
  const clearMultiSelect = useGraphStore((s) => s.clearMultiSelect);
  const batchDeleteNodes = useGraphStore((s) => s.batchDeleteNodes);
  const batchAddTag = useGraphStore((s) => s.batchAddTag);
  const batchSetLinkColor = useGraphStore((s) => s.batchSetLinkColor);
  const batchSetLinkTheme = useGraphStore((s) => s.batchSetLinkTheme);
  const markCycleLinks = useGraphStore((s) => s.markCycleLinks);
  const exportSubgraphByColor = useGraphStore((s) => s.exportSubgraphByColor);
  const exportSubgraphByTheme = useGraphStore((s) => s.exportSubgraphByTheme);
  const importProject = useGraphStore((s) => s.importProject);
  const saveCurrentProject = useGraphStore((s) => s.saveCurrentProject);

  if (multiSelectedIds.size === 0) return null;

  const ids = Array.from(multiSelectedIds);

  const handleSetColor = (color: string) => {
    batchSetLinkColor(ids, ids, color);
  };

  const handleMarkCycle = () => {
    markCycleLinks(ids, ids);
  };

  const handleSetTheme = () => {
    const theme = themeInput.trim();
    if (!theme) return;
    batchSetLinkTheme(ids, ids, theme);
    setThemeInput('');
  };

  const handleExportByColor = async (color: string) => {
    const project = exportSubgraphByColor(color);
    if (project.nodes.length === 0) {
      alert('该颜色下没有节点');
      return;
    }
    const name = prompt('为拆分出的项目命名', project.name);
    if (!name) return;
    await saveCurrentProject(name);
    importProject(project);
    await saveCurrentProject(`${name} (副本)`);
    setShowExportColor(false);
    clearMultiSelect();
  };

  const handleExportByTheme = async () => {
    const theme = themeInput.trim();
    if (!theme) return alert('请输入主题名称');
    const project = exportSubgraphByTheme(theme);
    if (project.nodes.length === 0) {
      alert('该主题下没有节点');
      return;
    }
    const name = prompt('为主题拆分出的项目命名', project.name);
    if (!name) return;
    await saveCurrentProject(name);
    importProject(project);
    await saveCurrentProject(`${name} (副本)`);
    setThemeInput('');
    clearMultiSelect();
  };

  return (
    <div className="absolute bottom-20 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2 rounded-sm border border-cosmic-700 bg-cosmic-900/90 px-4 py-3 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-cosmic-100">已选 {ids.length} 个节点</span>
        <div className="flex items-center gap-1">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="批量标签"
            className="cosmic-input w-24 py-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                batchAddTag(ids, tagInput.trim());
                setTagInput('');
              }
            }}
          />
          <button
            onClick={() => {
              if (tagInput.trim()) {
                batchAddTag(ids, tagInput.trim());
                setTagInput('');
              }
            }}
            className="rounded-sm bg-gradient-to-r from-crimson-600 to-crimson-800 px-3 py-1 text-xs font-medium text-white shadow-crimson-glow"
          >
            加标签
          </button>
        </div>
        <button
          onClick={() => {
            if (confirm(`确定删除选中的 ${ids.length} 个节点吗？`)) {
              batchDeleteNodes(ids);
            }
          }}
          className="rounded-sm bg-crimson-950/50 px-3 py-1 text-xs font-medium text-crimson-400 transition-colors hover:bg-crimson-900/50 hover:text-crimson-300"
        >
          删除
        </button>
        <button
          onClick={clearMultiSelect}
          className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-3 py-1 text-xs text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100"
        >
          清空
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs text-cosmic-500">连线颜色</span>
        {PRESET_COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => handleSetColor(c.value)}
            title={c.name}
            className="h-5 w-5 rounded-full border border-cosmic-700 transition-transform hover:scale-110"
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={handleMarkCycle}
          className="rounded-sm border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold transition-colors hover:bg-gold/20"
        >
          标记循环
        </button>
        <div className="flex items-center gap-1">
          <input
            value={themeInput}
            onChange={(e) => setThemeInput(e.target.value)}
            placeholder="主题名"
            className="cosmic-input w-24 py-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSetTheme();
            }}
          />
          <button
            onClick={handleSetTheme}
            className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-3 py-1 text-xs text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100"
          >
            设主题
          </button>
          <button
            onClick={handleExportByTheme}
            className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-3 py-1 text-xs text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100"
          >
            按主题拆分
          </button>
        </div>
        <button
          onClick={() => setShowExportColor(!showExportColor)}
          className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-3 py-1 text-xs text-cosmic-300 transition-colors hover:border-crimson-700 hover:text-cosmic-100"
        >
          按颜色拆分
        </button>
      </div>

      {showExportColor && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <span className="text-xs text-cosmic-500">选择要拆分的颜色</span>
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => handleExportByColor(c.value)}
              title={c.name}
              className="h-5 w-5 rounded-full border border-cosmic-700 transition-transform hover:scale-110"
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
