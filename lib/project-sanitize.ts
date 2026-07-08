import iconv from 'iconv-lite';
import { Project, GraphNode, GraphLink, ChangeLogEntry, ContentItem, Attachment, ContentCluster, GlobalReviewResult, ExecutionTask, FocusSession } from './types';

/**
 * Attempt to recover strings that were saved as UTF-8 but later read/decoded as GBK.
 * The symptom is a string of Chinese characters that are actually GBK bytes misinterpreted
 * as UTF-8. To reverse: encode the corrupted string as GBK, then decode those bytes as UTF-8.
 */
export function tryRecoverGbkMojibake(input: unknown): string {
  if (typeof input !== 'string') return '';
  if (!input) return input;

  try {
    const gbkBytes = iconv.encode(input, 'gbk');
    let recovered = iconv.decode(gbkBytes, 'utf8');
    // GBK mojibake produces UTF-8 bytes when the original UTF-8 text was misread as GBK.
    // If the corrupted string was truncated, there may be a trailing replacement char.
    recovered = recovered.replace(/\uFFFD+$/, '');
    // Use recovered text only if it decoded cleanly (no remaining replacement chars) and changed.
    if (recovered && recovered !== input && !recovered.includes('\uFFFD')) {
      return recovered;
    }
  } catch {
    // fall through
  }

  return input;
}

function asStringArray(arr: unknown, nodeLabels?: Set<string>): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => {
      if (item === null || item === undefined) return '';
      const recovered = typeof item === 'string' ? tryRecoverGbkMojibake(item) : tryRecoverGbkMojibake(String(item));
      return matchToNodeLabel(recovered, nodeLabels);
    })
    .filter((s) => s.length > 0);
}

function matchToNodeLabel(text: string, nodeLabels?: Set<string>): string {
  if (!text) return '';
  if (!nodeLabels || nodeLabels.size === 0) return text;
  if (nodeLabels.has(text)) return text;
  for (const label of Array.from(nodeLabels)) {
    if (label.startsWith(text)) return label;
  }
  for (const label of Array.from(nodeLabels)) {
    if (label.includes(text)) return label;
  }
  return text;
}

function sanitizeContentItem(ci: Partial<ContentItem>): ContentItem {
  return {
    id: typeof ci.id === 'string' && ci.id ? ci.id : `ci-${Math.random().toString(36).slice(2, 9)}`,
    title: typeof ci.title === 'string' ? tryRecoverGbkMojibake(ci.title) : '未命名条目',
    titleEn: typeof ci.titleEn === 'string' ? ci.titleEn : undefined,
    content: typeof ci.content === 'string' ? ci.content : '',
    contentEn: typeof ci.contentEn === 'string' ? ci.contentEn : undefined,
    type: (ci.type as ContentItem['type']) || 'note',
    tags: Array.isArray(ci.tags) ? ci.tags.map((t) => (typeof t === 'string' ? t : String(t ?? ''))) : [],
    sourceUrl: typeof ci.sourceUrl === 'string' ? ci.sourceUrl : undefined,
    createdAt: typeof ci.createdAt === 'number' ? ci.createdAt : Date.now(),
    updatedAt: typeof ci.updatedAt === 'number' ? ci.updatedAt : Date.now(),
  };
}

function sanitizeAttachment(att: Partial<Attachment>): Attachment {
  return {
    id: typeof att.id === 'string' && att.id ? att.id : `att-${Math.random().toString(36).slice(2, 9)}`,
    type: (att.type as Attachment['type']) || 'link',
    name: typeof att.name === 'string' ? tryRecoverGbkMojibake(att.name) : '未命名附件',
    blobRef: typeof att.blobRef === 'string' ? att.blobRef : undefined,
    url: typeof att.url === 'string' ? att.url : undefined,
    content: typeof att.content === 'string' ? att.content : undefined,
    createdAt: typeof att.createdAt === 'number' ? att.createdAt : Date.now(),
  };
}

function sanitizeNode(n: any): GraphNode {
  const label = typeof n?.label === 'string' ? tryRecoverGbkMojibake(n.label) : '未命名节点';
  return {
    id: typeof n?.id === 'string' && n.id ? n.id : `node-${Math.random().toString(36).slice(2, 9)}`,
    label,
    labelEn: typeof n?.labelEn === 'string' ? n.labelEn : undefined,
    type: (n?.type as GraphNode['type']) || 'concept',
    description: typeof n?.description === 'string' ? n.description : undefined,
    descriptionEn: typeof n?.descriptionEn === 'string' ? n.descriptionEn : undefined,
    color: typeof n?.color === 'string' ? n.color : undefined,
    val: typeof n?.val === 'number' ? n.val : undefined,
    grade: n?.grade as GraphNode['grade'] | undefined,
    aiGrade: n?.aiGrade === 'Ⅰ' || n?.aiGrade === 'Ⅱ' || n?.aiGrade === 'Ⅲ' ? n.aiGrade : undefined,
    parentId: typeof n?.parentId === 'string' ? n.parentId : undefined,
    attachments: Array.isArray(n?.attachments)
      ? n.attachments.map((a: any) => sanitizeAttachment(a || {}))
      : [],
    contentItems: Array.isArray(n?.contentItems)
      ? n.contentItems.map((ci: any) => sanitizeContentItem(ci || {}))
      : [],
    metadata: {
      source: typeof n?.metadata?.source === 'string' ? n.metadata.source : undefined,
      authors: Array.isArray(n?.metadata?.authors)
        ? n.metadata.authors.filter((a: any) => typeof a === 'string')
        : undefined,
      tags: Array.isArray(n?.metadata?.tags)
        ? n.metadata.tags.map((t: any) => (typeof t === 'string' ? t : String(t ?? '')))
        : [],
      createdAt: typeof n?.metadata?.createdAt === 'number' ? n.metadata.createdAt : Date.now(),
      updatedAt: typeof n?.metadata?.updatedAt === 'number' ? n.metadata.updatedAt : Date.now(),
    },
  };
}

function sanitizeLink(l: any): GraphLink {
  return {
    source: typeof l?.source === 'string' ? l.source : '',
    target: typeof l?.target === 'string' ? l.target : '',
    label: typeof l?.label === 'string' ? tryRecoverGbkMojibake(l.label) : undefined,
    value: typeof l?.value === 'number' ? l.value : undefined,
    color: typeof l?.color === 'string' ? l.color : undefined,
    theme: typeof l?.theme === 'string' ? l.theme : undefined,
    variant: l?.variant === 'cycle' ? 'cycle' : undefined,
  };
}

function sanitizeGlobalReview(review: any): GlobalReviewResult | undefined {
  if (!review || typeof review !== 'object') return undefined;
  const dimensions = Array.isArray(review.dimensions)
    ? review.dimensions
        .filter((d: any) => d && typeof d === 'object')
        .map((d: any) => ({
          name: typeof d.name === 'string' ? d.name : '维度',
          score: typeof d.score === 'number' ? d.score : 0,
          comment: typeof d.comment === 'string' ? d.comment : '',
        }))
    : [];
  return {
    summary: typeof review.summary === 'string' ? review.summary : '',
    score: typeof review.score === 'number' ? review.score : 0,
    strengths: Array.isArray(review.strengths) ? review.strengths.filter((s: any) => typeof s === 'string') : [],
    issues: Array.isArray(review.issues) ? review.issues.filter((s: any) => typeof s === 'string') : [],
    nextSteps: Array.isArray(review.nextSteps) ? review.nextSteps.filter((s: any) => typeof s === 'string') : [],
    dimensions,
    createdAt: typeof review.createdAt === 'number' ? review.createdAt : Date.now(),
    updatedAt: typeof review.updatedAt === 'number' ? review.updatedAt : Date.now(),
  };
}

function sanitizeContentCluster(cluster: any): ContentCluster | undefined {
  if (!cluster || typeof cluster !== 'object') return undefined;
  return {
    id: typeof cluster.id === 'string' && cluster.id ? cluster.id : `cluster-${Math.random().toString(36).slice(2, 9)}`,
    label: typeof cluster.label === 'string' ? cluster.label : '未命名区块',
    color: typeof cluster.color === 'string' ? cluster.color : '#64748b',
    explanation: typeof cluster.explanation === 'string' ? cluster.explanation : '',
    nodeIds: Array.isArray(cluster.nodeIds) ? cluster.nodeIds.filter((id: any) => typeof id === 'string') : [],
    keywords: Array.isArray(cluster.keywords) ? cluster.keywords.filter((k: any) => typeof k === 'string') : [],
    score: typeof cluster.score === 'number' ? cluster.score : undefined,
  };
}

function sanitizeExecutionTask(task: any): ExecutionTask {
  const position =
    task?.position && typeof task.position === 'object'
      ? {
          x: typeof task.position.x === 'number' ? task.position.x : 0,
          y: typeof task.position.y === 'number' ? task.position.y : 0,
        }
      : undefined;
  return {
    ...(task || {}),
    id: typeof task?.id === 'string' && task.id ? task.id : `task-${Math.random().toString(36).slice(2, 9)}`,
    title: typeof task?.title === 'string' ? task.title : '未命名任务',
    description: typeof task?.description === 'string' ? task.description : undefined,
    startDate: typeof task?.startDate === 'string' ? task.startDate : new Date().toISOString(),
    endDate: typeof task?.endDate === 'string' ? task.endDate : undefined,
    importance: typeof task?.importance === 'number' ? task.importance : 0.5,
    urgency: typeof task?.urgency === 'number' ? task.urgency : 0.5,
    difficulty: typeof task?.difficulty === 'number' ? task.difficulty : undefined,
    risk: typeof task?.risk === 'number' ? task.risk : undefined,
    customMetrics: typeof task?.customMetrics === 'object' && task.customMetrics ? task.customMetrics : {},
    nodeId: typeof task?.nodeId === 'string' ? task.nodeId : undefined,
    clusterId: typeof task?.clusterId === 'string' ? task.clusterId : undefined,
    parentTaskId: typeof task?.parentTaskId === 'string' ? task.parentTaskId : undefined,
    dependsOn: Array.isArray(task?.dependsOn) ? task.dependsOn.filter((id: any) => typeof id === 'string') : [],
    learningTools: Array.isArray(task?.learningTools) ? task.learningTools.filter((s: any) => typeof s === 'string') : [],
    deliverables: Array.isArray(task?.deliverables) ? task.deliverables.filter((s: any) => typeof s === 'string') : [],
    status: ['todo', 'doing', 'done', 'blocked'].includes(task?.status) ? task.status : 'todo',
    position,
    createdAt: typeof task?.createdAt === 'number' ? task.createdAt : Date.now(),
    updatedAt: typeof task?.updatedAt === 'number' ? task.updatedAt : Date.now(),
  };
}

function sanitizeChangeLogEntry(entry: any, nodeLabels?: Set<string>): ChangeLogEntry {
  return {
    id: typeof entry?.id === 'string' && entry.id ? entry.id : `log-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: typeof entry?.timestamp === 'number' ? entry.timestamp : Date.now(),
    prompt: typeof entry?.prompt === 'string' ? entry.prompt : '',
    summary: typeof entry?.summary === 'string' ? entry.summary : '',
    nodesAdded: asStringArray(entry?.nodesAdded, nodeLabels),
    nodesUpdated: asStringArray(entry?.nodesUpdated, nodeLabels),
    nodesRemoved: asStringArray(entry?.nodesRemoved, nodeLabels),
    linksAdded: typeof entry?.linksAdded === 'number' ? entry.linksAdded : 0,
  };
}

function sanitizeFocusSession(entry: any): FocusSession | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  const startedAt = typeof entry.startedAt === 'number' ? entry.startedAt : Date.now();
  const endedAt = typeof entry.endedAt === 'number' ? entry.endedAt : Date.now();
  return {
    id: typeof entry.id === 'string' ? entry.id : `focus-${Date.now()}`,
    startedAt,
    endedAt,
    effectiveMs: typeof entry.effectiveMs === 'number' ? entry.effectiveMs : Math.max(0, endedAt - startedAt),
    visualFocusScore: typeof entry.visualFocusScore === 'number' ? entry.visualFocusScore : 0,
    fatigueScore: typeof entry.fatigueScore === 'number' ? entry.fatigueScore : 0,
    faceLostMs: typeof entry.faceLostMs === 'number' ? entry.faceLostMs : 0,
    lookingAwayMs: typeof entry.lookingAwayMs === 'number' ? entry.lookingAwayMs : 0,
  };
}

export function sanitizeProject(project: any): Project {
  if (!project || typeof project !== 'object') {
    project = {};
  }

  const nodes = Array.isArray(project.nodes) ? project.nodes : [];
  const links = Array.isArray(project.links) ? project.links : [];

  const sanitizedNodes = nodes
    .filter((n: any) => n && typeof n === 'object')
    .map(sanitizeNode);
  const nodeLabels = new Set<string>(
    sanitizedNodes
      .map((n: GraphNode) => n.label)
      .filter((label: string | undefined): label is string => typeof label === 'string')
  );

  return {
    id: typeof project.id === 'string' && project.id ? project.id : `project-${Date.now()}`,
    name: typeof project.name === 'string' ? tryRecoverGbkMojibake(project.name) : '未命名项目',
    createdAt: typeof project.createdAt === 'number' ? project.createdAt : Date.now(),
    updatedAt: typeof project.updatedAt === 'number' ? project.updatedAt : Date.now(),
    nodes: sanitizedNodes,
    links: links
      .filter((l: any) => l && typeof l === 'object')
      .map(sanitizeLink)
      .filter((l: GraphLink) => l.source && l.target && l.source !== l.target),
    reasoningThreads: Array.isArray(project.reasoningThreads) ? project.reasoningThreads : [],
    evidenceItems: Array.isArray(project.evidenceItems) ? project.evidenceItems : [],
    executionTasks: Array.isArray(project.executionTasks)
      ? project.executionTasks.filter((t: any) => t && typeof t === 'object').map(sanitizeExecutionTask)
      : [],
    changeLog: Array.isArray(project.changeLog)
      ? project.changeLog
          .filter((e: any) => e && typeof e === 'object')
          .map((e: any) => sanitizeChangeLogEntry(e, nodeLabels))
      : [],
    overviewReport: typeof project.overviewReport === 'string' ? project.overviewReport : '',
    globalReview: sanitizeGlobalReview(project.globalReview),
    contentClusters: Array.isArray(project.contentClusters)
      ? project.contentClusters.map(sanitizeContentCluster).filter((c: ContentCluster | undefined): c is ContentCluster => !!c)
      : [],
    nebulaMode: project.nebulaMode === true,
    focusSessions: Array.isArray(project.focusSessions)
      ? project.focusSessions.map(sanitizeFocusSession).filter((s: FocusSession | undefined): s is FocusSession => !!s)
      : [],
  };
}
