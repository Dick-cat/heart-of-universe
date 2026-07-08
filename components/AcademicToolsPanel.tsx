'use client';

import { useState } from 'react';
import { AcademicSearchPanelInner } from './AcademicSearchPanelInner';

export function AcademicToolsPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'search' | 'review'>('search');

  return (
    <>
      {open && (
        <div className="fixed right-16 top-32 z-50 h-[calc(100vh-120px)] w-[440px] overflow-hidden rounded-none border border-cosmic-700 bg-cosmic-900/95 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-cosmic-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-crimson-400">ACADEMIC</span>
                <span className="font-bold tracking-wider text-cosmic-100">学术工具</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-cosmic-800 hover:text-cosmic-100"
              >
                ×
              </button>
            </div>
            <div className="flex border-b border-cosmic-800 bg-cosmic-950/40">
              <button
                onClick={() => setTab('search')}
                className={`flex-1 py-2 text-xs transition-colors ${
                  tab === 'search' ? 'bg-crimson-900/30 text-cosmic-100' : 'text-cosmic-500 hover:bg-cosmic-800'
                }`}
              >
                学术搜索
              </button>
              <button
                onClick={() => setTab('review')}
                className={`flex-1 py-2 text-xs transition-colors ${
                  tab === 'review' ? 'bg-crimson-900/30 text-cosmic-100' : 'text-cosmic-500 hover:bg-cosmic-800'
                }`}
              >
                学术审查
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {tab === 'search' && <AcademicSearchPanelInner />}
              {tab === 'review' && (
                <div className="p-4 text-xs text-cosmic-500">
                  <p className="mb-2 font-bold text-cosmic-300">学术审查</p>
                  <p>对选中节点执行方法学、来源可信度、可复现性审查。请使用右侧「证据仪表」中的 AI 深度审查功能，并重点关注学术来源与方法维度。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className={`fixed right-4 top-32 flex h-10 w-10 items-center justify-center rounded-none border border-cosmic-700 bg-cosmic-900/90 text-cosmic-200 shadow-lg backdrop-blur-xl transition-transform hover:scale-110 active:scale-95 ${
          open ? 'z-50' : 'z-40'
        }`}
        style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
        title="学术工具"
      >
        <span className="text-lg">📚</span>
      </button>
    </>
  );
}
