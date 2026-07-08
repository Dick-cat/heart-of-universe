'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div
      className={`prose prose-invert prose-sm max-w-none ${className}`}
      style={
        {
          '--tw-prose-links': '#f87171',
          '--tw-prose-bold': '#f5f5f5',
          '--tw-prose-headings': '#f5f5f5',
          '--tw-prose-code': '#facc15',
          '--tw-prose-pre-bg': '#0a0a0a',
          '--tw-prose-th-borders': '#262626',
          '--tw-prose-td-borders': '#262626',
        } as React.CSSProperties
      }
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
