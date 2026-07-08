'use client';

import { useState } from 'react';
import { GraphNode, ContentItem, Attachment } from '@/lib/types';

export type VirtualNodeKind = 'content' | 'attachment';

export interface VirtualMeta {
  kind: VirtualNodeKind;
  nodeId: string;
  itemId: string;
}

interface Props {
  virtual: VirtualMeta;
  parentNode: GraphNode;
  onClose: () => void;
  updateContentItem: (nodeId: string, itemId: string, updater: Partial<ContentItem>) => void;
  deleteContentItem: (nodeId: string, itemId: string) => void;
  updateNode: (id: string, updater: Partial<GraphNode>) => void;
  removeAttachment: (nodeId: string, attachmentId: string) => void;
}

export function VirtualNodeEditor({
  virtual,
  parentNode,
  onClose,
  updateContentItem,
  deleteContentItem,
  updateNode,
  removeAttachment,
}: Props) {
  if (virtual.kind === 'content') {
    const item = parentNode.contentItems.find((ci) => ci.id === virtual.itemId);
    if (!item) return null;
    return (
      <ContentItemEditor
        nodeId={parentNode.id}
        item={item}
        onClose={onClose}
        updateContentItem={updateContentItem}
        deleteContentItem={deleteContentItem}
      />
    );
  }

  const att = parentNode.attachments.find((a) => a.id === virtual.itemId);
  if (!att) return null;
  return (
    <AttachmentEditor
      nodeId={parentNode.id}
      attachment={att}
      attachments={parentNode.attachments}
      onClose={onClose}
      updateNode={updateNode}
      removeAttachment={removeAttachment}
    />
  );
}

function ContentItemEditor({
  nodeId,
  item,
  onClose,
  updateContentItem,
  deleteContentItem,
}: {
  nodeId: string;
  item: ContentItem;
  onClose: () => void;
  updateContentItem: (nodeId: string, itemId: string, updater: Partial<ContentItem>) => void;
  deleteContentItem: (nodeId: string, itemId: string) => void;
}) {
  const [draft, setDraft] = useState({ ...item });

  const save = () => {
    updateContentItem(nodeId, item.id, {
      title: draft.title,
      titleEn: draft.titleEn,
      content: draft.content,
      contentEn: draft.contentEn,
      type: draft.type,
      tags: draft.tags,
      sourceUrl: draft.sourceUrl,
    });
    onClose();
  };

  return (
    <div className="absolute bottom-2 left-2 right-2 z-30 max-h-[60%] overflow-y-auto rounded-sm border border-cosmic-700 bg-cosmic-900/95 p-3 text-xs backdrop-blur-md scrollbar-thin">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-cosmic-100">编辑内容条目</span>
        <button onClick={onClose} className="text-cosmic-500 hover:text-cosmic-200">关闭</button>
      </div>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="标题"
            className="cosmic-input flex-1"
          />
          <select
            value={draft.type}
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
          placeholder="English title"
          className="cosmic-input w-full italic text-cosmic-400"
        />
        <textarea
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          placeholder="内容（支持 Markdown）"
          className="cosmic-input h-24 w-full resize-none"
        />
        <textarea
          value={draft.contentEn || ''}
          onChange={(e) => setDraft({ ...draft, contentEn: e.target.value })}
          placeholder="English content"
          className="cosmic-input h-20 w-full resize-none italic text-cosmic-400"
        />
        <input
          value={draft.sourceUrl || ''}
          onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
          placeholder="来源链接"
          className="cosmic-input w-full"
        />
        <input
          value={draft.tags.join(', ')}
          onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="标签，逗号分隔"
          className="cosmic-input w-full"
        />
        <div className="flex gap-2 pt-1">
          <button onClick={save} className="cosmic-btn-primary flex-1 text-xs">保存</button>
          <button onClick={onClose} className="cosmic-btn-secondary flex-1 text-xs">取消</button>
          <button
            onClick={() => {
              if (confirm('确定删除该内容条目吗？')) {
                deleteContentItem(nodeId, item.id);
                onClose();
              }
            }}
            className="flex-1 rounded-sm border border-crimson-800 bg-crimson-950/30 py-1.5 text-xs text-crimson-400 hover:bg-crimson-900/40 hover:text-crimson-300"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachmentEditor({
  nodeId,
  attachment,
  attachments,
  onClose,
  updateNode,
  removeAttachment,
}: {
  nodeId: string;
  attachment: Attachment;
  attachments: Attachment[];
  onClose: () => void;
  updateNode: (id: string, updater: Partial<GraphNode>) => void;
  removeAttachment: (nodeId: string, attachmentId: string) => void;
}) {
  const [draft, setDraft] = useState({ ...attachment });

  const save = () => {
    updateNode(nodeId, {
      attachments: attachments.map((a) => (a.id === attachment.id ? { ...draft } : a)),
    });
    onClose();
  };

  return (
    <div className="absolute bottom-2 left-2 right-2 z-30 rounded-sm border border-cosmic-700 bg-cosmic-900/95 p-3 text-xs backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-cosmic-100">编辑附件</span>
        <button onClick={onClose} className="text-cosmic-500 hover:text-cosmic-200">关闭</button>
      </div>
      <div className="space-y-2">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="名称"
          className="cosmic-input w-full"
        />
        <select
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as Attachment['type'] })}
          className="cosmic-input w-full"
        >
          <option value="link">链接</option>
          <option value="pdf">PDF</option>
          <option value="video">视频</option>
          <option value="image">图片</option>
          <option value="note">笔记</option>
        </select>
        <input
          value={draft.url || ''}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          placeholder="URL"
          className="cosmic-input w-full"
        />
        <textarea
          value={draft.content || ''}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          placeholder="备注内容"
          className="cosmic-input h-20 w-full resize-none"
        />
        <div className="flex gap-2 pt-1">
          <button onClick={save} className="cosmic-btn-primary flex-1 text-xs">保存</button>
          <button onClick={onClose} className="cosmic-btn-secondary flex-1 text-xs">取消</button>
          <button
            onClick={() => {
              if (confirm('确定删除该附件吗？')) {
                removeAttachment(nodeId, attachment.id);
                onClose();
              }
            }}
            className="flex-1 rounded-sm border border-crimson-800 bg-crimson-950/30 py-1.5 text-xs text-crimson-400 hover:bg-crimson-900/40 hover:text-crimson-300"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
