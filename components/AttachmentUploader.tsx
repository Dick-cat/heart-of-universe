'use client';

import { useState, useRef } from 'react';
import { Attachment } from '@/lib/types';
import { useGraphStore } from '@/hooks/useGraphStore';
import { generateId } from '@/lib/graph-utils';
import { storeBlob } from '@/lib/db';

interface Props {
  nodeId: string;
}

export function AttachmentUploader({ nodeId }: Props) {
  const [url, setUrl] = useState('');
  const [urlName, setUrlName] = useState('');
  const [urlType, setUrlType] = useState<Attachment['type']>('link');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addAttachment = useGraphStore((s) => s.addAttachment);

  const addUrl = () => {
    if (!url.trim()) return;
    addAttachment(nodeId, {
      type: urlType,
      name: urlName.trim() || url,
      url: url.trim(),
    });
    setUrl('');
    setUrlName('');
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const id = generateId('blob');
      await storeBlob(id, file);
      const type: Attachment['type'] = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
        ? 'video'
        : 'pdf';
      addAttachment(nodeId, {
        id,
        type,
        name: file.name,
        blobRef: id,
      });
    } catch (err) {
      alert('文件保存失败：' + (err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-cosmic-700 bg-panel-elevated p-3">
      <div className="text-sm font-bold text-cosmic-200">添加附件</div>

      <div className="flex gap-2">
        <select
          value={urlType}
          onChange={(e) => setUrlType(e.target.value as Attachment['type'])}
          className="cosmic-input text-xs"
        >
          <option value="link">链接</option>
          <option value="pdf">PDF</option>
          <option value="video">视频</option>
          <option value="image">图片</option>
        </select>
        <input
          value={urlName}
          onChange={(e) => setUrlName(e.target.value)}
          placeholder="名称（可选）"
          className="cosmic-input flex-1 text-xs"
        />
      </div>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://... 或 AI 推荐的资源链接"
          className="cosmic-input flex-1 text-xs"
        />
        <button onClick={addUrl} className="cosmic-btn-primary px-3 text-xs">
          添加
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*,video/*,.pdf" className="hidden" onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-2xl border border-dashed border-cosmic-600 py-2 text-xs text-cosmic-400 transition-colors hover:border-crimson-600 hover:text-cosmic-200 disabled:opacity-50"
        >
          {uploading ? '保存中…' : '上传本地文件'}
        </button>
      </div>
    </div>
  );
}
