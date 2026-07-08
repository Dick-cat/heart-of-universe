import { Project } from './types';

export interface ElectronAPI {
  platform: string;
  openWindow: () => Promise<void>;
  writeBackup: (name: string, data: unknown) => Promise<{ success: boolean; path?: string; error?: string }>;
  readBackup: (name: string) => Promise<{ success: boolean; data?: Project; error?: string }>;
  listBackups: () => Promise<{ success: boolean; backups?: BackupInfo[]; error?: string }>;
}

export interface BackupInfo {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

export function getElectronAPI(): ElectronAPI | null {
  if (typeof window === 'undefined') return null;
  return (window as any).electronAPI as ElectronAPI | null;
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

export async function writeProjectBackup(name: string, project: Project): Promise<string | null> {
  const api = getElectronAPI();
  if (!api) return null;
  const result = await api.writeBackup(name, project);
  return result.success ? result.path || null : null;
}

export async function readProjectBackup(name: string): Promise<Project | null> {
  const api = getElectronAPI();
  if (!api) return null;
  const result = await api.readBackup(name);
  return result.success && result.data ? result.data : null;
}

export async function listProjectBackups(): Promise<BackupInfo[]> {
  const api = getElectronAPI();
  if (!api) return [];
  const result = await api.listBackups();
  return result.success ? result.backups || [] : [];
}
