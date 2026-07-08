'use client';

import { useEffect, useState } from 'react';
import { Attachment } from '@/lib/types';
import { getBlobUrl } from '@/lib/db';

interface Props {
  attachment: Attachment;
  onRemove: () => void;
}

export function AttachmentItem({ attachment, onRemove }: Props) {
  const [url, setUrl] = useState<string | undefined>(attachment.url);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (attachment.blobRef) {
      setLoading(true);
      getBlobUrl(attachment.blobRef)
        .then((blobUrl) => {
          if (blobUrl) setUrl(blobUrl);
        })
        .finally(() => setLoading(false));
    }
  }, [attachment.blobRef, attachment.id]);

  const isPdf = attachment.type === 'pdf';
  const isImage = attachment.type === 'image';
  const isVideo = attachment.type === 'video';

  return (
    <li className="rounded-sm border border-cosmic-700 bg-panel-elevated p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="text-xs text-cosmic-500">[{attachment.type}]</span>
          <span className="truncate text-cosmic-200" title={attachment.name}>
            {attachment.name}
          </span>
          {loading && <span className="text-[10px] text-cosmic-500">加载中…</span>}
        </div>
        <button
          onClick={onRemove}
          className="ml-2 text-xs text-cosmic-500 transition-colors hover:text-crimson-400"
        >
          删除
        </button>
      </div>

      {url && (
        <div className="mt-2">
          {isPdf && (
            <div className="space-y-2">
              <iframe
                src={url}
                title={attachment.name}
                className="h-48 w-full rounded-sm border border-cosmic-800 bg-white"
              />
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs text-crimson-400 hover:text-crimson-300 hover:underline"
              >
                在新窗口打开 PDF
              </a>
            </div>
          )}
          {isImage && (
            <a href={url} target="_blank" rel="noreferrer">
              <img
                src={url}
                alt={attachment.name}
                className="mt-2 max-h-48 rounded-sm border border-cosmic-800 object-contain"
              />
            </a>
          )}
          {isVideo && (
            <video
              src={url}
              controls
              className="mt-2 max-h-48 w-full rounded-sm border border-cosmic-800"
            />
          )}
          {!isPdf && !isImage && !isVideo && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-crimson-400 hover:text-crimson-300 hover:underline"
            >
              打开链接
            </a>
          )}
        </div>
      )}
    </li>
  );
}
