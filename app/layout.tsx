import type { Metadata } from 'next';
import './globals.css';
import { WindowSync } from '@/components/WindowSync';

export const metadata: Metadata = {
  title: '宇宙之心',
  description: 'AI 驱动的 3D 知识图谱与认知训练空间',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-cosmic text-cosmic-100 overflow-hidden font-sans selection:bg-crimson selection:text-white">
        <WindowSync />
        {children}
      </body>
    </html>
  );
}
