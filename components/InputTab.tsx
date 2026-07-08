'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { GraphNode } from '@/lib/types';
import { LogicTreeInput } from './LogicTreeInput';

type InputMode = 'manual' | 'connect' | 'quick' | 'logic';

const GRADES: { key: GraphNode['grade']; label: string; color: string }[] = [
  { key: 'core', label: '核心', color: '#f43f5e' },
  { key: 'important', label: '重要', color: '#f59e0b' },
  { key: 'normal', label: '一般', color: '#64748b' },
  { key: 'peripheral', label: '边缘', color: '#334155' },
];

export function InputTab() {
  const [mode, setMode] = useState<InputMode>('manual');

  const [newNode, setNewNode] = useState({ label: '', type: 'concept' as GraphNode['type'], description: '' });
  const [showTagExplanation, setShowTagExplanation] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  const nodes = useGraphStore((s) => s.nodes);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const multiSelectedIds = useGraphStore((s) => s.multiSelectedIds);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const addNode = useGraphStore((s) => s.addNode);
  const updateNode = useGraphStore((s) => s.updateNode);
  const clearMultiSelect = useGraphStore((s) => s.clearMultiSelect);
  const moveNodesToParent = useGraphStore((s) => s.moveNodesToParent);

  const handleAddNode = () => {
    if (!newNode.label.trim()) return;
    addNode({
      label: newNode.label.trim(),
      type: newNode.type,
      description: newNode.description.trim(),
    });
    setNewNode({ label: '', type: 'concept', description: '' });
  };

  const aiAssistTags = async () => {
    if (!selectedNode) return alert('请先选择一个节点');
    const text = `${selectedNode.label}. ${selectedNode.labelEn || ''}. ${selectedNode.description || ''} ${(selectedNode.contentItems || [])
      .map((ci) => ci.content)
      .join(' ')}`.slice(0, 2000);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'You are a tagging assistant. Given a text, suggest 3-8 concise, relevant bilingual tags and a one-sentence explanation. Respond with JSON only: {"tags":["中文标签","english-tag"],"explanation":"why"}',
            },
            { role: 'user', content: text },
          ],
          responseFormat: 'json_object',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const parsed = JSON.parse(json.content);
      const tags = parsed.tags || [];
      const currentTags = selectedNode.metadata.tags || [];
      updateNode(selectedNode.id, {
        metadata: { ...selectedNode.metadata, tags: Array.from(new Set([...currentTags, ...tags])) },
      });
      setShowTagExplanation(parsed.explanation || '');
    } catch (err: any) {
      alert('AI 打标签失败：' + err.message);
    }
  };

  const aiSummarize = async () => {
    if (!selectedNode) return alert('请先选择一个节点');
    const text = `${selectedNode.label}. ${selectedNode.labelEn || ''}. ${selectedNode.description || ''} ${(selectedNode.contentItems || [])
      .map((ci) => ci.content)
      .join(' ')}`.slice(0, 2000);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'You are a summarization assistant. Given a text, produce a concise bilingual summary. Respond with JSON only: {"title":"中文短标题","titleEn":"English Title","summary":"中文摘要","summaryEn":"English summary","tags":["中文标签","english-tag"]}',
            },
            { role: 'user', content: text },
          ],
          responseFormat: 'json_object',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const parsed = JSON.parse(json.content);
      useGraphStore.getState().addContentItem(selectedNode.id, {
        title: parsed.title || 'AI 摘要',
        titleEn: parsed.titleEn,
        content: parsed.summary || parsed.title || '',
        contentEn: parsed.summaryEn,
        type: 'summary',
        tags: parsed.tags || [],
      });
      setShowSummary(true);
      setTimeout(() => setShowSummary(false), 2000);
    } catch (err: any) {
      alert('AI 总结失败：' + err.message);
    }
  };

  const setGrade = (grade: GraphNode['grade']) => {
    if (!selectedNode) return;
    updateNode(selectedNode.id, { grade });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex gap-2 border-b border-cosmic-800 pb-2">
        {[
          { key: 'manual', label: '手动节点' },
          { key: 'connect', label: '关系连接' },
          { key: 'quick', label: '快速操作' },
          { key: 'logic', label: '逻辑树' },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key as InputMode)}
            className={`rounded-sm px-2 py-1 text-[10px] transition-colors ${
              mode === m.key ? 'bg-crimson-700 text-white' : 'text-cosmic-400 hover:bg-cosmic-800 hover:text-cosmic-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {mode === 'manual' && (
          <div className="space-y-2">
            <input
              value={newNode.label}
              onChange={(e) => setNewNode({ ...newNode, label: e.target.value })}
              placeholder="节点名称"
              className="cosmic-input w-full text-xs"
            />
            <select
              value={newNode.type}
              onChange={(e) => setNewNode({ ...newNode, type: e.target.value as GraphNode['type'] })}
              className="cosmic-input w-full text-xs"
            >
              <option value="concept">概念</option>
              <option value="principle">原理</option>
              <option value="meta">元知识</option>
              <option value="paper">论文</option>
              <option value="communication">通讯</option>
              <option value="ai-brief">AI 短述</option>
              <option value="note">笔记</option>
              <option value="custom">自定义</option>
            </select>
            <textarea
              value={newNode.description}
              onChange={(e) => setNewNode({ ...newNode, description: e.target.value })}
              placeholder="一句话描述（可选）"
              className="cosmic-input h-16 w-full resize-none text-xs"
            />
            <button onClick={handleAddNode} className="cosmic-btn-primary w-full text-xs">
              添加节点
            </button>
          </div>
        )}

        {mode === 'connect' && (
          <div className="space-y-2 text-xs text-cosmic-300">
            <p>使用 Shift+点击 多选节点，然后：</p>
            <button
              onClick={() => {
                if (!selectedNodeId) return alert('请先选中一个目标父节点');
                const ids = Array.from(multiSelectedIds);
                if (ids.length === 0) return alert('请 Shift+点击选择一个或多个要添入的节点');
                moveNodesToParent(ids, selectedNodeId);
                clearMultiSelect();
              }}
              className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-xs text-cosmic-200 transition-all hover:border-crimson-700 hover:text-cosmic-100"
            >
              添入子节点
            </button>
            <p className="text-cosmic-500">注意：Shift+点击两个节点会在画布中自动连线（由 Graph3D 处理）。</p>
          </div>
        )}

        {mode === 'quick' && (
          <div className="space-y-3">
            {selectedNode && (
              <div className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2 text-xs text-cosmic-300">
                当前选中：<span className="font-medium text-cosmic-100">{selectedNode.label}</span>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[10px] text-cosmic-500">节点分级</div>
              <div className="grid grid-cols-4 gap-1">
                {GRADES.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setGrade(g.key)}
                    className={`rounded-sm py-1 text-[10px] transition-colors ${
                      selectedNode?.grade === g.key
                        ? 'bg-cosmic-700 text-white'
                        : 'border border-cosmic-800 bg-cosmic-950/40 text-cosmic-300 hover:bg-cosmic-800'
                    }`}
                    style={{ borderColor: selectedNode?.grade === g.key ? g.color : undefined }}
                  >
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={aiAssistTags}
              disabled={!selectedNode}
              className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-xs text-cosmic-200 transition-all hover:border-crimson-700 hover:text-cosmic-100 disabled:opacity-40"
            >
              AI 打标签
            </button>
            {showTagExplanation && (
              <div className="rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-2 text-xs text-cosmic-400">
                {showTagExplanation}
              </div>
            )}

            <button
              onClick={aiSummarize}
              disabled={!selectedNode}
              className="w-full rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-xs text-cosmic-200 transition-all hover:border-crimson-700 hover:text-cosmic-100 disabled:opacity-40"
            >
              AI 总结
            </button>
            {showSummary && (
              <div className="rounded-sm border border-emerald-900/50 bg-emerald-950/30 p-2 text-xs text-emerald-300">
                已生成摘要并保存到节点内容中。
              </div>
            )}
          </div>
        )}

        {mode === 'logic' && <LogicTreeInput />}
      </div>
    </div>
  );
}
