'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { parseLogicTree } from '@/lib/logic-tree-parser';
import { generateId } from '@/lib/graph-utils';

const EXAMPLE = `研究目标
  文献综述
    OpenAlex 搜索
    arXiv 搜索
  实验设计
    数据集准备
    模型训练
  结果分析`;

export function LogicTreeInput() {
  const [text, setText] = useState(EXAMPLE);
  const [mode, setMode] = useState<'indent' | 'arrow'>('indent');
  const [preview, setPreview] = useState(() => parseLogicTree(EXAMPLE, 'indent'));
  const addNode = useGraphStore((s) => s.addNode);
  const addLink = useGraphStore((s) => s.addLink);

  const handleChange = (value: string) => {
    setText(value);
    try {
      setPreview(parseLogicTree(value, mode));
    } catch {
      // ignore parse errors while typing
    }
  };

  const handleModeChange = (newMode: 'indent' | 'arrow') => {
    setMode(newMode);
    try {
      setPreview(parseLogicTree(text, newMode));
    } catch {
      // ignore
    }
  };

  const importToGraph = () => {
    const now = Date.now();
    preview.nodes.forEach((n) => {
      addNode({
        id: n.id,
        label: n.label,
        type: 'concept',
        description: '',
        metadata: { createdAt: now, updatedAt: now },
      });
    });
    preview.links.forEach((l) => {
      addLink({ source: l.source, target: l.target, label: l.label });
    });
    alert(`已导入 ${preview.nodes.length} 个节点、${preview.links.length} 条关系`);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <select
          value={mode}
          onChange={(e) => handleModeChange(e.target.value as any)}
          className="cosmic-input w-28 text-xs"
        >
          <option value="indent">缩进树</option>
          <option value="arrow">箭头关系</option>
        </select>
        <button
          onClick={importToGraph}
          disabled={preview.nodes.length === 0}
          className="rounded-sm bg-crimson-700 px-3 py-1.5 text-xs text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
        >
          导入图谱
        </button>
      </div>

      <div className="flex flex-1 gap-3 overflow-hidden">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={mode === 'indent' ? '用缩进表示层级\n目标\n  子目标' : 'A -> B -> C'}
          className="cosmic-input min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
        />

        <div className="flex flex-1 flex-col overflow-hidden rounded-sm border border-cosmic-800 bg-cosmic-950/40">
          <div className="border-b border-cosmic-800 bg-cosmic-900/60 px-3 py-1.5 text-xs font-bold text-cosmic-300">
            预览 ({preview.nodes.length} 节点 / {preview.links.length} 关系)
          </div>
          <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
            {preview.nodes.length === 0 && (
              <div className="text-xs text-cosmic-500">输入文本以生成逻辑树</div>
            )}
            <ul className="space-y-1">
              {preview.nodes.map((n) => (
                <li
                  key={n.id}
                  className="text-xs text-cosmic-200"
                  style={{ paddingLeft: `${n.level * 16}px` }}
                >
                  <span className="text-cosmic-500">•</span> {n.label}
                </li>
              ))}
            </ul>
            {preview.links.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-cosmic-800 pt-2">
                {preview.links.map((l, i) => (
                  <div key={i} className="text-[10px] text-cosmic-500">
                    {l.source.slice(0, 12)}… → {l.target.slice(0, 12)}… ({l.label})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
