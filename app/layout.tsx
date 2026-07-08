import type { Metadata } from 'next';
import './globals.css';
import { WindowSync } from '@/components/WindowSync';
import { I18nProvider } from '@/components/I18nProvider';

export const metadata: Metadata = {
  title: 'Heart of Universe | 宇宙之心',
  description: 'AI-powered 3D knowledge graph and cognitive training workspace | AI 驱动的 3D 知识图谱与认知训练空间',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cosmic text-cosmic-100 overflow-hidden font-sans selection:bg-crimson selection:text-white">
        <I18nProvider>
          <WindowSync />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
