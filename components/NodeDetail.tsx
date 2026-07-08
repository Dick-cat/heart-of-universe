'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentItem } from './AttachmentItem';
import { MarkdownRenderer } from './MarkdownRenderer';
import { HeartClawLogo } from './HeartClawLogo';
import { generateId, typeColor } from '@/lib/graph-utils';
import { buildProjectContext, SYSTEM_PROMPT } from '@/lib/llm';
import { stripMarkdownFences } from '@/lib/auto-generation';
import { GraphNode, ContentItem, GraphLink, Project } from '@/lib/types';

const TABS = ['信息', '内容', '子节点', '附件', '关系'];

export function NodeDetail({ nodeId: propNodeId }: { nodeId?: string } = {}) {
  const [tab, setTab] = useState('内容');
  const [supplementing, setSupplementing] = useState(false);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const updateNode = useGraphStore((s) => s.updateNode);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const deleteLink = useGraphStore((s) => s.deleteLink);
  const updateLink = useGraphStore((s) => s.updateLink);
  const removeAttachment = useGraphStore((s) => s.removeAttachment);
  const exportSubgraphByTheme = useGraphStore((s) => s.exportSubgraphByTheme);
  const importProject = useGraphStore((s) => s.importProject);
  const saveCurrentProject = useGraphStore((s) => s.saveCurrentProject);
  const stickyNotes = useGraphStore((s) => s.stickyNotes);
  const closeStickyNote = useGraphStore((s) => s.closeStickyNote);
  const applyAIPayload = useGraphStore((s) => s.applyAIPayload);
  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);

  const targetNodeId = propNodeId || selectedNodeId;
  const node = nodes.find((n) => n.id === targetNodeId);
  if (!node) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-cosmic-900/80 p-6 text-cosmic-400">
        <div className="text-center">
          <HeartClawLogo size={48} className="mx-auto mb-3 opacity-60" />
          <div className="text-sm tracking-wider">点击图谱中的节点查看详情</div>
        </div>
      </div>
    );
  }

  const aiSupplementNode = async () => {
    if (!llmApiKey) {
      alert('请先配置 LLM API Key');
      return;
    }
    setSupplementing(true);
    try {
      const context = buildProjectContext(nodes, links, node.id);
      const contentItemsContext = (node.contentItems || [])
        .slice(0, 5)
        .map((ci) => `- ${ci.title}：${(ci.content || '').slice(0, 100)}`)
        .join('\n');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `请基于以下节点和项目上下文，补充扩展当前节点。优先生成其子节点、相关概念、前置知识或内容条目，并将新节点作为当前节点的子节点（parentId=${node.id}）。\n\n当前节点：[${node.id}] ${node.label}\n描述：${node.description || ''}\n\n已有内容条目：\n${contentItemsContext || '无'}\n\n项目上下文：\n${context}`,
            },
          ],
          provider: llmProvider,
          apiKey: llmApiKey,
          baseURL: llmBaseUrl,
          model: llmModel,
          responseFormat: 'json_object',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'LLM 请求失败');
      const payload = JSON.parse(stripMarkdownFences(json.content || '{}'));
      // Ensure new nodes are attached under the current node and linked back
      const newNodes = (payload.nodes || []).map((n: any) => ({
        ...n,
        parentId: n.parentId || node.id,
      }));
      const newLinks = [
        ...(payload.links || []),
        ...newNodes
          .filter((n: any) => n.id !== node.id)
          .map((n: any) => ({ source: node.id, target: n.id, label: '包含/相关' })),
      ];
      applyAIPayload({ ...payload, nodes: newNodes, links: newLinks }, `AI 模式补充：${node.label}`);
    } catch (err: any) {
      alert('AI 补充失败：' + err.message);
    } finally {
      setSupplementing(false);
    }
  };

  const relatedLinks = links.filter((l) => l.source === node.id || l.target === node.id);
  const relatedNodes = relatedLinks
    .map((l) => nodes.find((n) => n.id === (l.source === node.id ? l.target : l.source)))
    .filter(Boolean) as GraphNode[];

  return (
    <div className="flex h-full w-full flex-col bg-cosmic-900/80 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-panel-border/60 px-5 py-4">
        <h2 className="truncate text-lg font-bold tracking-wide text-cosmic-100">{node.label}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={aiSupplementNode}
            disabled={supplementing}
            className="rounded-sm px-3 py-1 text-xs text-crimson-400 transition-colors hover:bg-crimson-950/30 hover:text-crimson-300 disabled:opacity-50"
          >
            {supplementing ? '补充中…' : 'AI 补充'}
          </button>
          <button
            onClick={() => deleteNode(node.id)}
            className="rounded-sm px-3 py-1 text-xs text-crimson-400 transition-colors hover:bg-crimson-950/30 hover:text-crimson-300"
          >
            删除
          </button>
        </div>
      </div>

      <div className="flex border-b border-panel-border/60">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-medium tracking-wider transition-colors ${
              tab === t
                ? 'border-b-2 border-crimson-500 text-cosmic-100'
                : 'text-cosmic-500 hover:text-cosmic-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
        {tab === '信息' && (
          <div className="space-y-4">
            <BilingualField
              label="名称"
              value={node.label}
              valueEn={node.labelEn}
              onChange={(v) => updateNode(node.id, { label: v })}
              onChangeEn={(v) => updateNode(node.id, { labelEn: v })}
            />
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-cosmic-500">类型</label>
              <select
                value={node.type}
                onChange={(e) => updateNode(node.id, { type: e.target.value as GraphNode['type'] })}
                className="cosmic-input mt-1 w-full"
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
            </div>
            <BilingualField
              label="描述"
              value={node.description || ''}
              valueEn={node.descriptionEn || ''}
              onChange={(v) => updateNode(node.id, { description: v })}
              onChangeEn={(v) => updateNode(node.id, { descriptionEn: v })}
              multiline
            />
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-cosmic-500">
                节点标签（逗号分隔）
              </label>
              <input
                value={node.metadata?.tags?.join(', ') || ''}
                onChange={(e) =>
                  updateNode(node.id, {
                    metadata: {
                      ...node.metadata,
                      tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
                className="cosmic-input mt-1 w-full"
              />
            </div>

            <div className="border-t border-panel-border/60 pt-4">
              <button
                onClick={() => {
                  if (confirm(`确定删除节点「${node.label}」吗？`)) {
                    const note = stickyNotes.find((n) => n.nodeId === node.id);
                    if (note) closeStickyNote(note.id);
                    deleteNode(node.id);
                  }
                }}
                className="w-full rounded-sm border border-crimson-800 bg-crimson-950/30 py-2 text-sm font-medium text-crimson-400 transition-colors hover:bg-crimson-900/40 hover:text-crimson-300"
              >
                删除节点
              </button>
            </div>
          </div>
        )}

        {tab === '内容' && <ContentItemsTab node={node} />}

        {tab === '子节点' && <SubNodesTab node={node} />}

        {tab === '附件' && (
          <div className="space-y-4">
            <AttachmentUploader nodeId={node.id} />
            {(node.attachments || []).length === 0 ? (
              <div className="text-sm text-cosmic-500">暂无附件</div>
            ) : (
              <ul className="space-y-2">
                {(node.attachments || []).map((att) => (
                  <AttachmentItem
                    key={att.id}
                    attachment={att}
                    onRemove={() => removeAttachment(node.id, att.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === '关系' && (
          <RelationsTab
            node={node}
            relatedLinks={relatedLinks}
            relatedNodes={relatedNodes}
            updateLink={updateLink}
            deleteLink={deleteLink}
            exportSubgraphByTheme={exportSubgraphByTheme}
            importProject={importProject}
            saveCurrentProject={saveCurrentProject}
          />
        )}
      </div>
    </div>
  );
}

function BilingualField({
  label,
  value,
  valueEn,
  onChange,
  onChangeEn,
  multiline,
}: {
  label: string;
  value: string;
  valueEn?: string;
  onChange: (v: string) => void;
  onChangeEn?: (v: string) => void;
  multiline?: boolean;
}) {
  const Input = multiline ? 'textarea' : 'input';
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wider text-cosmic-500">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`cosmic-input w-full ${multiline ? 'h-20 resize-none' : ''}`}
      />
      {onChangeEn && (
        <Input
          value={valueEn || ''}
          onChange={(e) => onChangeEn(e.target.value)}
          placeholder={`${label} (English)`}
          className={`cosmic-input w-full italic text-cosmic-400 ${multiline ? 'h-20 resize-none' : ''}`}
        />
      )}
    </div>
  );
}

function ContentItemsTab({ node }: { node: GraphNode }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ContentItem>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const addContentItem = useGraphStore((s) => s.addContentItem);
  const updateContentItem = useGraphStore((s) => s.updateContentItem);
  const deleteContentItem = useGraphStore((s) => s.deleteContentItem);

  const startNew = () => {
    const id = generateId('ci');
    const empty: ContentItem = {
      id,
      title: '新条目',
      content: '',
      type: 'note',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addContentItem(node.id, empty);
    setEditingId(id);
    setDraft(empty);
  };

  const startEdit = (item: ContentItem) => {
    setEditingId(item.id);
    setDraft({ ...item });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateContentItem(node.id, editingId, {
      title: draft.title,
      titleEn: draft.titleEn,
      content: draft.content,
      contentEn: draft.contentEn,
      type: draft.type,
      tags: draft.tags,
      sourceUrl: draft.sourceUrl,
    });
    setEditingId(null);
    setDraft({});
  };

  const addAnnotation = (item: ContentItem) => {
    const selectedText = window.getSelection()?.toString();
    const annotation: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'> = {
      title: `批注：${item.title}`,
      content: selectedText ? `> ${selectedText}\n\n` : '',
      type: 'annotation',
      tags: item.tags,
      sourceUrl: item.sourceUrl,
    };
    addContentItem(node.id, annotation);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={startNew}
        className="w-full rounded-sm border border-dashed border-cosmic-600 py-2.5 text-sm text-cosmic-400 transition-colors hover:border-crimson-600 hover:text-cosmic-200"
      >
        + 添加内容条目
      </button>

      {(node.contentItems || []).length === 0 && (
        <div className="text-sm text-cosmic-500">暂无内容条目。AI 生成的节点会自动填充摘要。</div>
      )}

      {(node.contentItems || []).map((item) => (
        <div key={item.id} className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
          {editingId === item.id ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={draft.title || ''}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="中文标题"
                  className="cosmic-input flex-1"
                />
                <select
                  value={draft.type || 'note'}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as ContentItem['type'] })}
                  className="cosmic-input"
                >
                  <option value="abstract">摘要</option>
                  <option value="note">笔记</option>
                  <option value="excerpt">摘录</option>
                  <option value="annotation">批注</option>
                  <option value="summary">总结</option>
                  <option value="report">报告</option>
                  <option value="simulation">推演</option>
                  <option value="plan">计划</option>
                  <option value="evidence">证据</option>
                </select>
              </div>
              <input
                value={draft.titleEn || ''}
                onChange={(e) => setDraft({ ...draft, titleEn: e.target.value })}
                placeholder="English Title"
                className="cosmic-input w-full italic text-cosmic-400"
              />
              <div className="text-xs text-cosmic-500">支持 Markdown</div>
              <textarea
                value={draft.content || ''}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder="在此用 Markdown 写作…"
                className="cosmic-input h-32 w-full resize-none"
              />
              <textarea
                value={draft.contentEn || ''}
                onChange={(e) => setDraft({ ...draft, contentEn: e.target.value })}
                placeholder="English content (Markdown supported)"
                className="cosmic-input h-24 w-full resize-none italic text-cosmic-400"
              />
              <input
                value={draft.sourceUrl || ''}
                onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
                placeholder="来源链接（可选）"
                className="cosmic-input w-full"
              />
              <input
                value={draft.tags?.join(', ') || ''}
                onChange={(e) =>
                  setDraft({ ...draft, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                }
                placeholder="标签，逗号分隔"
                className="cosmic-input w-full"
              />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="cosmic-btn-primary flex-1 text-xs">
                  保存
                </button>
                <button onClick={() => setEditingId(null)} className="cosmic-btn-secondary flex-1 text-xs">
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div
              className="space-y-2"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/heart-content-item', JSON.stringify({ itemId: item.id, sourceNodeId: node.id }));
                e.dataTransfer.effectAllowed = 'move';
              }}
              title="拖到图谱区域可生成新节点"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-crimson-400">[{typeLabel(item.type)}]</span>
                    <span className="font-medium text-cosmic-100">{item.title}</span>
                  </div>
                  {item.titleEn && <div className="text-xs italic text-cosmic-500">{item.titleEn}</div>}
                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-cosmic-500 hover:text-crimson-400"
                    >
                      {item.sourceUrl}
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreviewId(previewId === item.id ? null : item.id)}
                    className="text-xs text-cosmic-500 transition-colors hover:text-cosmic-200"
                  >
                    {previewId === item.id ? '隐藏' : '预览'}
                  </button>
                  <button
                    onClick={() => startEdit(item)}
                    className="text-xs text-cosmic-500 transition-colors hover:text-cosmic-200"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => addAnnotation(item)}
                    className="text-xs text-cosmic-500 transition-colors hover:text-cosmic-200"
                  >
                    批注
                  </button>
                  <button
                    onClick={() => deleteContentItem(node.id, item.id)}
                    className="text-xs text-cosmic-500 transition-colors hover:text-crimson-400"
                  >
                    删除
                  </button>
                </div>
              </div>
              {previewId === item.id ? (
                <div className="rounded-sm bg-cosmic-950/50 p-3">
                  <MarkdownRenderer content={item.content} />
                  {item.contentEn && (
                    <div className="mt-3 border-t border-cosmic-800 pt-3 italic text-cosmic-400">
                      <MarkdownRenderer content={item.contentEn} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-cosmic-300">{item.content}</div>
              )}
              {(item.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(item.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-2 py-0.5 text-xs text-cosmic-400"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function typeLabel(type: ContentItem['type']): string {
  const map: Record<string, string> = {
    abstract: '摘要',
    note: '笔记',
    excerpt: '摘录',
    annotation: '批注',
    summary: '总结',
    report: '报告',
    simulation: '推演',
    plan: '计划',
    evidence: '证据',
  };
  return map[type] || type;
}

function SubNodesTab({ node }: { node: GraphNode }) {
  const nodes = useGraphStore((s) => s.nodes);
  const enterNodeView = useGraphStore((s) => s.enterNodeView);
  const moveNodeToParent = useGraphStore((s) => s.moveNodeToParent);
  const subNodes = nodes.filter((n) => n.parentId === node.id);

  return (
    <div className="space-y-3">
      <div className="text-xs text-cosmic-500">
        当前节点包含 {subNodes.length} 个子节点。双击子节点可进入其内部网络。
      </div>
      {subNodes.length === 0 ? (
        <div className="text-sm text-cosmic-500">暂无子节点。可将其他节点拖入此节点，或把内容条目拖出为节点。</div>
      ) : (
        <ul className="space-y-2">
          {subNodes.map((n) => (
            <li
              key={n.id}
              className="flex items-center justify-between rounded-sm border border-cosmic-700 bg-panel-elevated px-3 py-2 text-sm"
            >
              <button
                onClick={() => enterNodeView(n.id)}
                className="text-left text-cosmic-200 hover:text-crimson-400"
              >
                {n.label}
              </button>
              <button
                onClick={() => moveNodeToParent(n.id, null)}
                className="text-xs text-cosmic-500 transition-colors hover:text-crimson-400"
              >
                移出
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PRESET_LINK_COLORS = [
  { name: '赤红', value: '#ef4444' },
  { name: '橙金', value: '#f97316' },
  { name: '明黄', value: '#eab308' },
  { name: '翠绿', value: '#22c55e' },
  { name: '青蓝', value: '#06b6d4' },
  { name: '靛紫', value: '#8b5cf6' },
  { name: '玫粉', value: '#ec4899' },
  { name: '灰白', value: '#cbd5e1' },
];

function RelationsTab({
  node,
  relatedLinks,
  relatedNodes,
  updateLink,
  deleteLink,
  exportSubgraphByTheme,
  importProject,
  saveCurrentProject,
}: {
  node: GraphNode;
  relatedLinks: GraphLink[];
  relatedNodes: GraphNode[];
  updateLink: (source: string, target: string, updater: Partial<GraphLink>) => void;
  deleteLink: (source: string, target: string) => void;
  exportSubgraphByTheme: (theme: string) => { name: string; nodes: GraphNode[]; links: GraphLink[] };
  importProject: (project: Project) => void;
  saveCurrentProject: (name: string) => Promise<string>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const nodes = useGraphStore((s) => s.nodes);

  const handleExportByTag = async (theme: string) => {
    const project = exportSubgraphByTheme(theme);
    if (project.nodes.length === 0) {
      alert('该关系标签下没有节点');
      return;
    }
    const name = prompt('为拆分出的项目命名', project.name);
    if (!name) return;
    await saveCurrentProject(name);
    importProject({
      ...project,
      id: generateId('project'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Project);
    await saveCurrentProject(`${name} (副本)`);
  };

  const aiOptimizeRelations = async () => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const context = relatedLinks
      .map((l) => {
        const otherId = l.source === node.id ? l.target : l.source;
        const other = nodeMap.get(otherId as string);
        return `- ${node.label} → ${other?.label || otherId}（当前说明：${l.label || '无'}，标签：${l.theme || '无'}）`;
      })
      .join('\n');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'You are a knowledge graph relation assistant. Given a node and its relationships, suggest concise bilingual labels and tags for each relationship. Respond with JSON only: {"relations":[{"target":"node label","label":"中文说明","labelEn":"English label","theme":"关系标签","color":"#hexcolor"}]}.',
            },
            {
              role: 'user',
              content: `节点：${node.label}\n${node.description || ''}\n\n关系列表：\n${context}`,
            },
          ],
          responseFormat: 'json_object',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const parsed = JSON.parse(json.content);
      const suggestions: Array<{ target: string; label: string; labelEn: string; theme: string; color: string }> =
        parsed.relations || [];

      for (const link of relatedLinks) {
        const otherId = link.source === node.id ? link.target : link.source;
        const other = nodeMap.get(otherId as string);
        const suggestion = suggestions.find((s) => s.target === other?.label);
        if (suggestion) {
          updateLink(link.source as string, link.target as string, {
            label: suggestion.label,
            theme: suggestion.theme,
            color: suggestion.color,
          });
        }
      }
    } catch (err: any) {
      alert('AI 优化关系失败：' + err.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={aiOptimizeRelations}
          className="flex-1 rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-1.5 text-xs text-cosmic-200 transition-all hover:border-crimson-700 hover:text-cosmic-100"
        >
          AI 优化关系
        </button>
      </div>
      <AddRelation nodeId={node.id} />
      {relatedNodes.length === 0 ? (
        <div className="text-sm text-cosmic-500">暂无关系</div>
      ) : (
        <ul className="space-y-2">
          {relatedLinks.map((link) => {
            const otherId = link.source === node.id ? link.target : link.source;
            const other = nodes.find((n) => n.id === otherId);
            if (!other) return null;
            const isEditing = editingId === `${link.source}->${link.target}`;
            return (
              <li
                key={`${link.source}->${link.target}`}
                className="rounded-sm border border-cosmic-700 bg-panel-elevated px-3 py-2 text-sm"
              >
                {isEditing ? (
                  <RelationEditor
                    link={link}
                    onSave={(updater) => {
                      updateLink(link.source as string, link.target as string, updater);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-cosmic-200">{other.label}</span>
                        {link.color && (
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: link.color }}
                          />
                        )}
                      </div>
                      <div className="text-xs text-cosmic-500">
                        {link.label ? `说明：${link.label}` : '无说明'}
                        {link.theme ? ` · 标签：${link.theme}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingId(`${link.source}->${link.target}`)}
                        className="text-xs text-cosmic-500 transition-colors hover:text-cosmic-200"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleExportByTag(link.theme || link.label || '未分类')}
                        className="text-xs text-cosmic-500 transition-colors hover:text-cosmic-200"
                      >
                        拆分
                      </button>
                      <button
                        onClick={() => deleteLink(link.source as string, link.target as string)}
                        className="text-xs text-cosmic-500 transition-colors hover:text-crimson-400"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RelationEditor({
  link,
  onSave,
  onCancel,
}: {
  link: GraphLink;
  onSave: (updater: Partial<GraphLink>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(link.label || '');
  const [theme, setTheme] = useState(link.theme || '');
  const [color, setColor] = useState(link.color || '#94a3b8');

  return (
    <div className="space-y-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="关系说明"
        className="cosmic-input w-full"
      />
      <input
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        placeholder="关系标签"
        className="cosmic-input w-full"
      />
      <div className="flex flex-wrap gap-1">
        {PRESET_LINK_COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            title={c.name}
            className={`h-5 w-5 rounded-full border ${color === c.value ? 'border-white' : 'border-cosmic-700'}`}
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ label: label || undefined, theme: theme || undefined, color })} className="cosmic-btn-primary flex-1 text-xs">
          保存
        </button>
        <button onClick={onCancel} className="cosmic-btn-secondary flex-1 text-xs">
          取消
        </button>
      </div>
    </div>
  );
}

function AddRelation({ nodeId }: { nodeId: string }) {
  const [targetId, setTargetId] = useState('');
  const [label, setLabel] = useState('');
  const nodes = useGraphStore((s) => s.nodes);
  const addLink = useGraphStore((s) => s.addLink);

  const submit = () => {
    if (!targetId || targetId === nodeId) return;
    addLink({ source: nodeId, target: targetId, label: label || undefined });
    setTargetId('');
    setLabel('');
  };

  return (
    <div className="space-y-2 rounded-sm border border-cosmic-700 bg-panel-elevated p-3">
      <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="cosmic-input w-full">
        <option value="">选择关联节点</option>
        {nodes
          .filter((n) => n.id !== nodeId)
          .map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
      </select>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="关系说明（可选）"
        className="cosmic-input w-full"
      />
      <button onClick={submit} className="cosmic-btn-primary w-full text-xs">
        添加关系
      </button>
    </div>
  );
}
