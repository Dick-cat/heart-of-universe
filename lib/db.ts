import Dexie, { Table } from 'dexie';
import { Attachment, GraphNode, GraphLink, Project, AttentionSessionRecord, ReasoningThread, EvidenceItem, ExecutionTask, ChangeLogEntry, ContentCluster, GlobalReviewResult } from './types';
import { AttentionSession } from './attention';

export class KnowledgeGraphDB extends Dexie {
  nodes!: Table<GraphNode, string>;
  links!: Table<GraphLink, [string, string]>;
  attachments!: Table<Attachment, string>;
  projects!: Table<Project, string>;
  blobs!: Table<{ id: string; blob: Blob; createdAt: number }, string>;
  attentionSessions!: Table<AttentionSessionRecord, string>;

  constructor() {
    super('ai-knowledge-graph');
    this.version(1).stores({
      nodes: 'id, label, type',
      links: '[source+target], source, target',
      attachments: 'id, blobRef',
      projects: 'id, name, updatedAt',
    });
    this.version(2).stores({
      nodes: 'id, label, type',
      links: '[source+target], source, target',
      attachments: 'id, blobRef',
      projects: 'id, name, updatedAt',
      blobs: 'id, createdAt',
      attentionSessions: 'id, contentId, contentType, startTime',
    });
  }
}

export const db = typeof window !== 'undefined' ? new KnowledgeGraphDB() : null;

export async function saveProject(
  name: string,
  nodes: GraphNode[],
  links: GraphLink[],
  extras: {
    reasoningThreads?: ReasoningThread[];
    evidenceItems?: EvidenceItem[];
    executionTasks?: ExecutionTask[];
    changeLog?: ChangeLogEntry[];
    overviewReport?: string;
    globalReview?: GlobalReviewResult | null;
    contentClusters?: ContentCluster[];
    nebulaMode?: boolean;
    focusSessions?: import('./types').FocusSession[];
  } = {},
  existingId?: string | null
): Promise<string> {
  if (!db) throw new Error('IndexedDB is not available');
  const id = existingId || crypto.randomUUID();
  const now = Date.now();
  const existing = existingId ? await db.projects.get(existingId) : undefined;
  await db.projects.put({
    id,
    name,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    nodes,
    links,
    reasoningThreads: extras.reasoningThreads || [],
    evidenceItems: extras.evidenceItems || [],
    executionTasks: extras.executionTasks || [],
    changeLog: extras.changeLog || [],
    overviewReport: extras.overviewReport || '',
    globalReview: extras.globalReview || undefined,
    contentClusters: extras.contentClusters || [],
    nebulaMode: extras.nebulaMode || false,
    focusSessions: extras.focusSessions || [],
  });
  return id;
}

export async function loadProject(id: string): Promise<Project | undefined> {
  if (!db) return undefined;
  return db.projects.get(id);
}

export async function listProjects(): Promise<Project[]> {
  if (!db) return [];
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function deleteProject(id: string): Promise<void> {
  if (!db) return;
  await db.projects.delete(id);
}

export async function storeBlob(id: string, file: File): Promise<void> {
  if (!db) throw new Error('IndexedDB is not available');
  await db.blobs.put({
    id,
    blob: file,
    createdAt: Date.now(),
  });
  await db.attachments.put({
    id,
    type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'pdf',
    name: file.name,
    blobRef: id,
    createdAt: Date.now(),
  });
}

export async function getBlobUrl(blobRef: string): Promise<string | undefined> {
  if (!db) return undefined;
  const blobRecord = await db.blobs.get(blobRef);
  if (!blobRecord) return undefined;
  return URL.createObjectURL(blobRecord.blob);
}

export async function deleteBlob(blobRef: string): Promise<void> {
  if (!db) return;
  await db.blobs.delete(blobRef);
}

export async function saveAttentionSession(session: AttentionSession): Promise<void> {
  if (!db) return;
  const record: AttentionSessionRecord = {
    id: session.id,
    startTime: session.startTime,
    endTime: session.endTime || Date.now(),
    contentId: session.contentId,
    contentType: session.contentType,
    contentLength: session.contentLength,
    score: session.score,
    flags: session.flags,
    totalMs: session.totalMs,
    focusMs: session.focusMs,
    totalIdleMs: session.totalIdleMs,
    scrollCoverage: session.scrollCoverage,
    interactionCount: session.interactionCount,
  };
  await db.attentionSessions.put(record);
}

export async function listAttentionSessions(limit = 100): Promise<AttentionSessionRecord[]> {
  if (!db) return [];
  return db.attentionSessions.orderBy('startTime').reverse().limit(limit).toArray();
}

export async function getAttentionStats(): Promise<{
  totalSessions: number;
  averageScore: number;
  totalFocusMinutes: number;
}> {
  if (!db) return { totalSessions: 0, averageScore: 0, totalFocusMinutes: 0 };
  const sessions = await db.attentionSessions.toArray();
  if (sessions.length === 0) return { totalSessions: 0, averageScore: 0, totalFocusMinutes: 0 };
  const totalFocusMs = sessions.reduce((sum, s) => sum + (s.focusMs || 0), 0);
  const averageScore = sessions.reduce((sum, s) => sum + (s.score || 0), 0) / sessions.length;
  return {
    totalSessions: sessions.length,
    averageScore: Math.round(averageScore * 100) / 100,
    totalFocusMinutes: Math.round(totalFocusMs / 60000),
  };
}
