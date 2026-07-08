'use client';

import { useState } from 'react';
import { GraphViewPort } from './GraphViewPort';
import { useRouter } from 'next/navigation';

const LAYOUTS = [
  { key: '2', label: '双视图', cols: 2, count: 2 },
  { key: '3', label: '三视图', cols: 2, count: 3 },
  { key: '4', label: '四视图', cols: 2, count: 4 },
] as const;

export function MultiViewGrid() {
  const router = useRouter();
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]>(LAYOUTS[0]);

  return (
    <div className="flex h-screen flex-col bg-cosmic-950">
      <header className="flex h-12 items-center justify-between border-b border-cosmic-800 px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 px-3 py-1 text-xs text-cosmic-300 hover:text-cosmic-100"
          >
            ← 返回主视图
          </button>
          <h1 className="text-sm font-bold tracking-wider text-cosmic-100">多视图分屏</h1>
        </div>
        <div className="flex items-center gap-1 rounded-sm border border-cosmic-800 p-1">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLayout(l)}
              className={`rounded-sm px-3 py-1 text-xs transition-colors ${
                layout.key === l.key
                  ? 'bg-crimson-600 text-white'
                  : 'text-cosmic-400 hover:text-cosmic-200'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <div
        className="grid flex-1 gap-2 p-2"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: layout.count > 2 ? 'repeat(2, minmax(0, 1fr))' : '1fr',
        }}
      >
        {Array.from({ length: layout.count }).map((_, i) => (
          <GraphViewPort
            key={`${layout.key}-${i}`}
            className={layout.count === 3 && i === 0 ? 'row-span-2' : undefined}
          />
        ))}
      </div>
    </div>
  );
}
