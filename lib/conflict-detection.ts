import { EvidenceItem, ReasoningStep, Conflict, ConflictAction, ContentCluster, GlobalReviewResult, ExecutionTask } from './types';

export function detectEvidenceConflicts(evidenceItems: EvidenceItem[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < evidenceItems.length; i++) {
    for (let j = i + 1; j < evidenceItems.length; j++) {
      const a = evidenceItems[i];
      const b = evidenceItems[j];
      const score = conflictScore(a, b);
      if (score > 0.6) {
        conflicts.push({
          id: `conflict-${a.id}-${b.id}`,
          type: score > 0.85 ? 'fact' : 'source',
          evidenceA: a.id,
          evidenceB: b.id,
          severity: score > 0.85 ? 'high' : score > 0.7 ? 'medium' : 'low',
          description: `证据 "${a.title}" 与 "${b.title}" 在来源或摘要上存在显著差异。`,
          resolutionSuggestions: ['核对原始来源', '补充更多证据', '评估来源可信度'],
          status: 'detected',
          createdAt: Date.now(),
        });
      }
    }
  }
  return conflicts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function conflictScore(a: EvidenceItem, b: EvidenceItem): number {
  let score = 0;
  if (a.sourceType !== b.sourceType) score += 0.2;
  if (a.credibility !== b.credibility) score += 0.2;
  const shared = sharedKeywords(a.summary, b.summary);
  if (shared.length > 0) score += 0.1;
  const contradictionWords = ['反对', '反驳', 'contradict', 'dispute', 'not support', '不一致', '否', 'but', 'however', 'although'];
  const aHas = contradictionWords.some((w) => a.summary.toLowerCase().includes(w));
  const bHas = contradictionWords.some((w) => b.summary.toLowerCase().includes(w));
  if (aHas || bHas) score += 0.5;
  return Math.min(1, score);
}

function sharedKeywords(a: string, b: string): string[] {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const wordsB = b.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return wordsB.filter((w) => wordsA.has(w));
}

export function detectStepConflicts(steps: ReasoningStep[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      const a = steps[i];
      const b = steps[j];
      const shared = sharedKeywords(a.claim, b.claim);
      if (shared.length > 0 && a.status !== b.status && a.status !== 'pending' && b.status !== 'pending') {
        conflicts.push({
          id: `conflict-step-${a.id}-${b.id}`,
          type: 'logic',
          evidenceA: a.id,
          evidenceB: b.id,
          severity: 'medium',
          description: `步骤 "${a.claim.slice(0, 30)}" 与 "${b.claim.slice(0, 30)}" 在相似主题上结论相反。`,
          resolutionSuggestions: ['检查前提条件是否不同', '补充限定边界', '寻找更精确证据'],
          status: 'detected',
          createdAt: Date.now(),
        });
      }
    }
  }
  return conflicts;
}

export interface ConflictContext {
  evidenceItems: EvidenceItem[];
  steps: ReasoningStep[];
  contentClusters?: ContentCluster[];
  globalReview?: GlobalReviewResult | null;
  executionTasks?: ExecutionTask[];
}

export async function detectConflictsWithAI(
  context: ConflictContext,
  llmSettings: { provider: string; apiKey: string; baseURL: string; model: string }
): Promise<Conflict[]> {
  const { evidenceItems, steps, contentClusters, globalReview, executionTasks } = context;
  if (evidenceItems.length + steps.length < 2) return [];

  const evidenceText = evidenceItems
    .map((e) => `- ${e.title} (${e.source}, ${e.credibility}): ${e.summary.slice(0, 200)}`)
    .join('\n');
  const stepText = steps.map((s) => `- ${s.claim.slice(0, 80)} (${s.status}): ${s.reasoning.slice(0, 150)}`).join('\n');

  const clusterText = contentClusters?.length
    ? contentClusters
        .map((c) => `- ${c.label}（关键词：${c.keywords.join(', ')}）：${c.explanation}`)
        .join('\n')
    : '无';
  const reviewText = globalReview
    ? `综合评分 ${globalReview.score}/10；关键问题：${globalReview.issues.slice(0, 5).join('；')}`
    : '无';
  const taskText = executionTasks?.length
    ? executionTasks
        .map((t) => `- ${t.title} [${t.status}] ${t.endDate ? '截止 ' + new Date(t.endDate).toLocaleDateString() : ''}`)
        .join('\n')
    : '无';

  const prompt = `请审查以下证据、推理步骤、内容区块、全局审查与执行任务，识别其中可能存在的冲突、矛盾或不一致，并给出可执行的行动建议。

证据：
${evidenceText || '无'}

推理步骤：
${stepText || '无'}

内容区块：
${clusterText}

全局审查：
${reviewText}

执行任务：
${taskText}

请输出 JSON 数组，每个冲突包含：
- type: "fact" | "logic" | "source" | "probability"
- evidenceA: 第一个证据/步骤的标识（标题或 claim）
- evidenceB: 第二个证据/步骤的标识
- severity: "low" | "medium" | "high"
- description: 具体冲突描述
- resolutionSuggestions: 字符串数组
- suggestedActions: 对象数组，每个对象包含：
  - id: 行动唯一标识
  - title: 行动标题
  - description: 行动说明
  - actionType: "create" | "update" | "block" | "start"
  - taskId: 若 actionType 不是 create，则填写对应任务标题或 ID
  - priority: "high" | "medium" | "low"
  - dueHint: 建议处理时间描述（可选）

只输出 JSON 数组，不要 Markdown。`;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a conflict detection and execution planning assistant. Respond with JSON only.' },
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
  if (!res.ok) throw new Error(json.error || 'AI 请求失败');

  let parsed: any[] = [];
  try {
    parsed = JSON.parse(json.content);
  } catch {
    return [];
  }

  return parsed.map((c: any, i: number) => ({
    id: `ai-conflict-${i}-${Date.now()}`,
    type: ['fact', 'logic', 'source', 'probability'].includes(c.type) ? c.type : 'logic',
    evidenceA: c.evidenceA || '未知',
    evidenceB: c.evidenceB || '未知',
    severity: ['low', 'medium', 'high'].includes(c.severity) ? c.severity : 'medium',
    description: c.description || 'AI 检测到潜在冲突',
    resolutionSuggestions: Array.isArray(c.resolutionSuggestions) ? c.resolutionSuggestions.map(String) : ['人工复核'],
    suggestedActions: Array.isArray(c.suggestedActions)
      ? c.suggestedActions
          .map((a: any, idx: number): ConflictAction | null => {
            if (!a || typeof a !== 'object') return null;
            const actionType = ['create', 'update', 'block', 'start'].includes(a.actionType) ? a.actionType : 'create';
            return {
              id: typeof a.id === 'string' && a.id ? a.id : `action-${idx}-${Date.now()}`,
              title: typeof a.title === 'string' ? a.title : '未命名行动',
              description: typeof a.description === 'string' ? a.description : '',
              actionType,
              taskId: typeof a.taskId === 'string' ? a.taskId : undefined,
              priority: ['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'medium',
              dueHint: typeof a.dueHint === 'string' ? a.dueHint : undefined,
            };
          })
          .filter((a: ConflictAction | null): a is ConflictAction => !!a)
      : [],
    status: 'detected' as const,
    createdAt: Date.now(),
  }));
}

export function createManualConflict(evidenceA: string, evidenceB: string, description: string): Conflict {
  return {
    id: `manual-${Date.now()}`,
    type: 'fact',
    evidenceA,
    evidenceB,
    severity: 'medium',
    description,
    resolutionSuggestions: ['人工复核', '补充证据', '明确边界条件'],
    status: 'detected',
    createdAt: Date.now(),
  };
}

function severityRank(s: string): number {
  return { high: 3, medium: 2, low: 1 }[s] || 0;
}
