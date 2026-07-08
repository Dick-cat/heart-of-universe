import { ExecutionTask, GraphNode, ContentCluster } from './types';

export interface ParsedTaskDraft {
  title: string;
  description?: string;
  status: 'todo' | 'done';
  startDate: string;
  endDate?: string;
  nodeId?: string;
  clusterId?: string;
  deliverables?: string[];
  dependsOnTitles?: string[];
  dependsOn?: string[];
}

const TASK_LINE_RE = /^(\d+)\.\s+\[([ xX])\]\s+(.+?)(?:\s*\(([^)]*)\))?\s*$/;
const TIME_RANGE_RE = /(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\s*→\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)/;

function normalizeDate(input: string): string {
  const d = new Date(input.replace(/-/g, '/'));
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  return d.toISOString().slice(0, 16);
}

export function parseMarkdownPlan(
  md: string,
  existingTasks: ExecutionTask[],
  nodes: GraphNode[],
  clusters: ContentCluster[]
): ParsedTaskDraft[] {
  const lines = md.split(/\r?\n/);
  const drafts: ParsedTaskDraft[] = [];
  let current: ParsedTaskDraft | null = null;

  const titleToId = new Map<string, string>();
  for (const t of existingTasks) titleToId.set(t.title.trim(), t.id);

  const labelToNodeId = new Map<string, string>();
  for (const n of nodes) labelToNodeId.set(n.label.trim(), n.id);

  const labelToClusterId = new Map<string, string>();
  for (const c of clusters) labelToClusterId.set(c.label.trim(), c.id);

  const flushCurrent = () => {
    if (current) {
      drafts.push(current);
      current = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = TASK_LINE_RE.exec(line);
    if (match) {
      flushCurrent();
      const titleWithTime = match[3].trim();
      const timeRangeMatch = TIME_RANGE_RE.exec(match[4] || '');
      let title = titleWithTime;
      let startDate = new Date().toISOString().slice(0, 16);
      let endDate: string | undefined;

      if (timeRangeMatch) {
        startDate = normalizeDate(timeRangeMatch[1]);
        endDate = normalizeDate(timeRangeMatch[2]);
      } else {
        // try extract time from title itself
        const titleTimeMatch = TIME_RANGE_RE.exec(title);
        if (titleTimeMatch) {
          startDate = normalizeDate(titleTimeMatch[1]);
          endDate = normalizeDate(titleTimeMatch[2]);
          title = title.replace(TIME_RANGE_RE, '').trim();
        }
      }

      current = {
        title,
        status: match[2].toLowerCase() === 'x' ? 'done' : 'todo',
        startDate,
        endDate,
        deliverables: [],
        dependsOnTitles: [],
      };
      continue;
    }

    if (!current) continue;

    const bullet = line.match(/^\s*-\s*(.+)$/);
    if (!bullet) continue;
    const content = bullet[1].trim();

    if (content.startsWith('关联节点：')) {
      const val = content.replace('关联节点：', '').trim();
      if (val) {
        current.nodeId =
          labelToNodeId.get(val) || nodes.find((n) => n.id === val)?.id || undefined;
      }
    } else if (content.startsWith('关联区块：')) {
      const val = content.replace('关联区块：', '').trim();
      if (val) {
        current.clusterId =
          labelToClusterId.get(val) || clusters.find((c) => c.id === val)?.id || undefined;
      }
    } else if (content.startsWith('交付物：')) {
      const val = content.replace('交付物：', '').trim();
      if (val) current.deliverables = val.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    } else if (content.startsWith('依赖：')) {
      const val = content.replace('依赖：', '').trim();
      if (val) {
        current.dependsOnTitles = val.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      }
    } else if (content.startsWith('说明：')) {
      current.description = content.replace('说明：', '').trim();
    }
  }

  flushCurrent();

  // Resolve dependencies by title
  for (const d of drafts) {
    if (d.dependsOnTitles && d.dependsOnTitles.length > 0) {
      d.dependsOn = d.dependsOnTitles
        .map((title) => {
          const existing = titleToId.get(title);
          if (existing) return existing;
          const draftIndex = drafts.findIndex((x) => x.title.trim() === title);
          return draftIndex >= 0 ? `__draft_${draftIndex}` : undefined;
        })
        .filter((id): id is string => !!id);
    }
  }

  return drafts;
}

export function tasksToMarkdownPlan(tasks: ExecutionTask[], nodes: GraphNode[], clusters: ContentCluster[]): string {
  if (tasks.length === 0) {
    return '# 项目执行计划\n\n暂无任务。\n';
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const clusterMap = new Map(clusters.map((c) => [c.id, c]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const sorted = topologicalSort(tasks);

  const lines: string[] = ['# 项目执行计划', ''];

  sorted.forEach((t, idx) => {
    const statusMark = t.status === 'done' ? 'x' : ' ';
    const start = formatDateTime(t.startDate);
    const end = t.endDate ? formatDateTime(t.endDate) : '';
    const timeRange = end ? `${start} → ${end}` : start;
    lines.push(`${idx + 1}. [${statusMark}] ${t.title}（${timeRange}）`);
    if (t.description) lines.push(`   - 说明：${t.description}`);
    if (t.nodeId) {
      const node = nodeMap.get(t.nodeId);
      lines.push(`   - 关联节点：${node ? node.label : t.nodeId}`);
    }
    if (t.clusterId) {
      const cluster = clusterMap.get(t.clusterId);
      lines.push(`   - 关联区块：${cluster ? cluster.label : t.clusterId}`);
    }
    if (t.deliverables && t.deliverables.length > 0) {
      lines.push(`   - 交付物：${t.deliverables.join('， ')}`);
    }
    if (t.dependsOn && t.dependsOn.length > 0) {
      const depTitles = t.dependsOn
        .map((id) => taskMap.get(id)?.title)
        .filter(Boolean)
        .join('， ');
      if (depTitles) lines.push(`   - 依赖：${depTitles}`);
    }
  });

  lines.push('');
  return lines.join('\n');
}

function formatDateTime(input: string): string {
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function topologicalSort(tasks: ExecutionTask[]): ExecutionTask[] {
  const map = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const result: ExecutionTask[] = [];

  function visit(t: ExecutionTask) {
    if (visited.has(t.id)) return;
    visited.add(t.id);
    for (const depId of t.dependsOn || []) {
      const dep = map.get(depId);
      if (dep) visit(dep);
    }
    result.push(t);
  }

  const byStart = [...tasks].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  for (const t of byStart) visit(t);
  return result;
}
