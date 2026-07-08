import { ExecutionTask, GraphNode, GraphLink, ContentCluster, GlobalReviewResult } from './types';
import { generateId } from './graph-utils';

export interface TaskPlanInput {
  goal: string;
  context?: string;
  startDate?: string;
  deadline?: string;
}

export interface PlannedTask {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  importance: number;
  urgency: number;
  difficulty?: number;
  risk?: number;
  dependsOn?: number[]; // indices to previous tasks
  learningTools?: string[];
  deliverables?: string[];
  nodeId?: string;
  clusterId?: string;
}

export interface GraphPlanInput {
  nodes: GraphNode[];
  links: GraphLink[];
  contentClusters?: ContentCluster[];
  globalReview?: GlobalReviewResult | null;
  existingTasks?: ExecutionTask[];
  goal?: string;
  deadline?: string;
  startDate?: string;
}

export async function planTasksFromGoal(
  input: TaskPlanInput,
  llmSettings: {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
  }
): Promise<PlannedTask[]> {
  const start = input.startDate || new Date().toISOString().slice(0, 16);
  const deadline = input.deadline || '';

  const prompt = `你是一名项目教练。请根据目标制定一份可执行的任务计划。

目标：${input.goal}
${input.context ? `上下文：${input.context}` : ''}
开始时间：${start}
${deadline ? `截止时间：${deadline}` : ''}

输出 JSON 数组，每个任务包含：
- title: 任务标题
- description: 一句话描述
- startDate: ISO datetime 字符串（YYYY-MM-DDTHH:mm）
- endDate: 可选
- importance: 0-1
- urgency: 0-1
- difficulty: 0-1 可选
- risk: 0-1 可选
- dependsOn: 依赖的前面任务的索引数组（从 0 开始），可选
- learningTools: 为完成该任务推荐的学习资源/工具列表，可选
- deliverables: 交付物列表，可选
- nodeId: 关联的知识节点 id，可选
- clusterId: 关联的内容区块 id，可选

只输出 JSON 数组，不要 Markdown。`;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a project coach. Respond with JSON only.' },
        { role: 'user', content: prompt },
      ],
      provider: llmSettings.provider,
      apiKey: llmSettings.apiKey,
      baseURL: llmSettings.baseURL,
      model: llmSettings.model,
      responseFormat: 'json_object',
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '请求失败');

  let tasks: any[] = [];
  try {
    tasks = JSON.parse(json.content);
  } catch {
    throw new Error('AI 返回了非 JSON 输出');
  }

  if (!Array.isArray(tasks)) throw new Error('AI 返回的任务计划不是数组');

  return normalizePlannedTasks(tasks, start);
}

export async function generateMarkdownPlanFromGraph(
  input: GraphPlanInput,
  llmSettings: {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
  }
): Promise<string> {
  const start = input.startDate || new Date().toISOString().slice(0, 16);
  const deadline = input.deadline || '';

  const nodeText = input.nodes
    .map(
      (n) =>
        `- [${n.id}] ${n.label} (${n.type})${n.description ? ': ' + n.description.slice(0, 120) : ''}`
    )
    .join('\n');

  const linkText = input.links
    .map((l) => {
      const sNode = input.nodes.find((n) => n.id === l.source);
      const tNode = input.nodes.find((n) => n.id === l.target);
      return `- ${sNode?.label || l.source} → ${tNode?.label || l.target}${l.label ? ` (${l.label})` : ''}`;
    })
    .join('\n');

  const clusterText = (input.contentClusters || [])
    .map(
      (c) =>
        `- [${c.id}] ${c.label}：${c.explanation || ''}（关键词：${c.keywords.join(', ')}；节点：${c.nodeIds.length}）`
    )
    .join('\n');

  const reviewText = input.globalReview
    ? `综合评分 ${input.globalReview.score}/10；总结：${input.globalReview.summary}；关键问题：${input.globalReview.issues
        .slice(0, 5)
        .join('；')}；建议下一步：${input.globalReview.nextSteps.slice(0, 5).join('；')}`
    : '无';

  const existingText = (input.existingTasks || [])
    .map((t) => `- ${t.title} [${t.status}]`)
    .join('\n');

  const prompt = `你是一名项目管理专家。请基于以下 3D 知识图谱 JSON/文本，输出一份严谨的 Markdown 项目执行计划。

知识节点：
${nodeText || '无'}

节点关系：
${linkText || '无'}

内容区块（热力图/星云记忆）：
${clusterText || '无'}

全局审查记忆：
${reviewText}

已有任务：
${existingText || '无'}

${input.goal ? `用户补充目标/约束：${input.goal}` : ''}
开始时间：${start}
${deadline ? `项目截止时间：${deadline}` : ''}

要求：
1. 只输出 Markdown，不要输出 JSON 或代码块包裹。
2. 必须包含一级标题：# 项目执行计划。
3. 用二级标题划分阶段，例如 ## 阶段一：调研。
4. 每个任务格式：
   1. [ ] 任务标题（开始时间 → 结束时间）
      - 说明：一句话描述
      - 关联节点：节点 label 或 id
      - 关联区块：区块 label 或 id
      - 交付物：交付物1，交付物2
      - 依赖：前面任务的标题
5. 若任务已完成可标记 [x]。
6. 任务顺序必须合理，依赖关系明确，时间连续，可直接用于项目管理。
7. 不要给出多个方案，只输出一份可执行的规划文档。`;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a project management expert. Respond with Markdown only.' },
        { role: 'user', content: prompt },
      ],
      provider: llmSettings.provider,
      apiKey: llmSettings.apiKey,
      baseURL: llmSettings.baseURL,
      model: llmSettings.model,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '请求失败');
  return stripMarkdownFences(json.content || '');
}

export async function generateMarkdownPlanFromGoal(
  input: TaskPlanInput,
  llmSettings: {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
  }
): Promise<string> {
  const start = input.startDate || new Date().toISOString().slice(0, 16);
  const deadline = input.deadline || '';

  const prompt = `你是一名项目管理专家。请根据以下目标输出一份严谨的 Markdown 项目执行计划。

目标：${input.goal}
${input.context ? `上下文：${input.context}` : ''}
开始时间：${start}
${deadline ? `项目截止时间：${deadline}` : ''}

要求：
1. 只输出 Markdown，不要输出 JSON 或代码块包裹。
2. 必须包含一级标题：# 项目执行计划。
3. 用二级标题划分阶段，例如 ## 阶段一：调研。
4. 每个任务格式：
   1. [ ] 任务标题（开始时间 → 结束时间）
      - 说明：一句话描述
      - 关联节点：节点 label 或 id（可选）
      - 关联区块：区块 label 或 id（可选）
      - 交付物：交付物1，交付物2
      - 依赖：前面任务的标题
5. 任务顺序必须合理，依赖关系明确，时间连续，可直接用于项目管理。
6. 不要给出多个方案，只输出一份可执行的规划文档。`;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a project management expert. Respond with Markdown only.' },
        { role: 'user', content: prompt },
      ],
      provider: llmSettings.provider,
      apiKey: llmSettings.apiKey,
      baseURL: llmSettings.baseURL,
      model: llmSettings.model,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '请求失败');
  return stripMarkdownFences(json.content || '');
}

function stripMarkdownFences(content: string): string {
  return content.replace(/^```(?:markdown)?\s*\n?([\s\S]*?)```\s*$/g, '$1').trim();
}

function normalizePlannedTasks(tasks: any[], fallbackStart: string): PlannedTask[] {
  return tasks.map((t) => ({
    title: t.title || '未命名任务',
    description: t.description,
    startDate: t.startDate || fallbackStart,
    endDate: t.endDate,
    importance: clamp(t.importance ?? 0.5),
    urgency: clamp(t.urgency ?? 0.5),
    difficulty: clamp(t.difficulty ?? 0.5),
    risk: clamp(t.risk ?? 0.3),
    dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map((i: number) => parseInt(i as any, 10)).filter((i: number) => !isNaN(i)) : [],
    learningTools: Array.isArray(t.learningTools) ? t.learningTools.map(String) : [],
    deliverables: Array.isArray(t.deliverables) ? t.deliverables.map(String) : [],
    nodeId: typeof t.nodeId === 'string' ? t.nodeId : undefined,
    clusterId: typeof t.clusterId === 'string' ? t.clusterId : undefined,
  }));
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
}

export function convertPlanToTasks(plan: PlannedTask[]): Omit<ExecutionTask, 'id' | 'createdAt' | 'updatedAt'>[] {
  const idMap = new Map<number, string>();
  const result: Omit<ExecutionTask, 'id' | 'createdAt' | 'updatedAt'>[] = [];

  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const taskId = generateId('task');
    idMap.set(i, taskId);
    const task: Omit<ExecutionTask, 'id' | 'createdAt' | 'updatedAt'> = {
      title: p.title,
      description: p.description,
      startDate: p.startDate,
      endDate: p.endDate,
      importance: p.importance,
      urgency: p.urgency,
      difficulty: p.difficulty,
      risk: p.risk,
      customMetrics: {},
      dependsOn: (p.dependsOn || [])
        .map((idx) => idMap.get(idx))
        .filter((id): id is string => !!id),
      learningTools: p.learningTools,
      deliverables: p.deliverables,
      status: 'todo',
      nodeId: p.nodeId,
      clusterId: p.clusterId,
    };
    result.push(task);
  }

  return result;
}

export function layoutTasksByOrder(
  tasks: Omit<ExecutionTask, 'id' | 'createdAt' | 'updatedAt'>[],
  startX = 80,
  startY = 80,
  stepX = 260,
  stepY = 220
): Array<Omit<ExecutionTask, 'id' | 'createdAt' | 'updatedAt'> & { position: { x: number; y: number } }> {
  // Simple topological layering for visual order
  const map = new Map<string, Omit<ExecutionTask, 'id' | 'createdAt' | 'updatedAt'>>();
  tasks.forEach((t, i) => map.set(`idx-${i}`, t));

  const depths = new Map<string, number>();
  function depthOf(key: string): number {
    if (depths.has(key)) return depths.get(key)!;
    const t = map.get(key);
    if (!t || !t.dependsOn || t.dependsOn.length === 0) {
      depths.set(key, 0);
      return 0;
    }
    const maxDep = Math.max(...t.dependsOn.map((depId) => {
      const depKey = Array.from(map.entries()).find(([, v]) => (v as any).id === depId)?.[0];
      return depKey ? depthOf(depKey) : 0;
    }));
    depths.set(key, maxDep + 1);
    return maxDep + 1;
  }

  const keyed = tasks.map((t, i) => ({ key: `idx-${i}`, task: t, index: i }));
  keyed.forEach(({ key }) => depthOf(key));
  keyed.sort((a, b) => {
    const dDiff = depthOf(a.key) - depthOf(b.key);
    return dDiff !== 0 ? dDiff : a.index - b.index;
  });

  const rowCounts = new Map<number, number>();
  return keyed.map(({ key, task }) => {
    const d = depthOf(key);
    const rowIndex = rowCounts.get(d) || 0;
    rowCounts.set(d, rowIndex + 1);
    return {
      ...task,
      position: {
        x: startX + d * stepX,
        y: startY + rowIndex * stepY,
      },
    };
  });
}
