import { GraphNode, GraphLink, ReasoningThread, ContentCluster, GlobalReviewResult, ExecutionTask, ReasoningDirection } from './types';

export interface ReasonStepOutput {
  claim: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  suggestedEvidenceQuery: string;
}

export interface ReasonDirectionOutput {
  id: string;
  label: string;
  description: string;
  estimatedImpact: string;
  risks: string[];
}

export interface ReasonOutput {
  title: string;
  summary: string;
  steps: ReasonStepOutput[];
  directions: ReasonDirectionOutput[];
}

const REASON_SYSTEM_PROMPT = `你是一名严谨的认知教练与逻辑分析助手。你的任务是把用户的问题拆解为一条可审查的思维链（Chain-of-Thought），并给出若干可供用户选择的推理方向。

输出必须是 JSON，格式如下：
{
  "title": "问题的简短标题",
  "summary": "对问题与整体结论的简短中文概述",
  "directions": [
    {
      "id": "dir-1",
      "label": "方向一句话标题",
      "description": "该方向要解决什么、采用什么角度",
      "estimatedImpact": "如果该方向成立，对结论或行动的影响",
      "risks": ["风险1", "风险2"]
    }
  ],
  "steps": [
    {
      "claim": "该步骤得出的核心论断（必须具体、可检验）",
      "reasoning": "从已有信息到该论断的推导过程（不能只是重复结论）",
      "confidence": "high | medium | low",
      "suggestedEvidenceQuery": "用于在学术数据库或网络中搜索支持/反驳该论断的关键词（英文优先）"
    }
  ]
}

规则：
1. directions 必须提供 2-4 个明显不同的推理方向，供用户选择或修改。
2. 每个方向的 label 要简洁，description 要说明角度和假设。
3. steps 默认给出你最推荐方向下的推理链；如果多个方向难分优劣，可在 summary 中说明。
4. 每一步的 claim 必须是可被证据支持或推翻的具体命题，不能是空泛描述。
5. reasoning 必须展示“为什么”会得出该 claim，而不是简单罗列信息。
6. confidence 必须诚实反映证据强度，不确定时标为 low/medium。
7. 只输出 JSON，不要 Markdown 代码块。`;

export interface ReasonContextInput {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNodeId?: string | null;
  contentClusters?: ContentCluster[];
  globalReview?: GlobalReviewResult | null;
  executionTasks?: ExecutionTask[];
}

export function buildReasonContext(input: ReasonContextInput): string {
  const { nodes, links, selectedNodeId, contentClusters, globalReview, executionTasks } = input;
  const selected = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const lines: string[] = [];
  if (selected) {
    lines.push(`当前选中节点：${selected.label}（${selected.type}）`);
    if (selected.description) lines.push(`描述：${selected.description}`);
  }

  const relevantNodes = selected
    ? [
        selected,
        ...links
          .filter((l) => l.source === selected.id || l.target === selected.id)
          .map((l) => nodeMap.get(l.source === selected.id ? (l.target as string) : (l.source as string)))
          .filter(Boolean),
      ].slice(0, 20)
    : nodes.slice(0, 30);

  lines.push('相关节点：');
  for (const n of relevantNodes as GraphNode[]) {
    lines.push(`- ${n.label}（${n.type}）${n.description ? ': ' + n.description : ''}`);
  }

  const relevantLinks = selected
    ? links.filter((l) => l.source === selected.id || l.target === selected.id)
    : links.slice(0, 40);

  lines.push('相关关系：');
  for (const l of relevantLinks) {
    const s = nodeMap.get(l.source as string)?.label || l.source;
    const t = nodeMap.get(l.target as string)?.label || l.target;
    lines.push(`- ${s} → ${t}${l.label ? ` (${l.label})` : ''}`);
  }

  if (contentClusters && contentClusters.length > 0) {
    lines.push('内容区块（热力图/星云）记忆：');
    for (const c of contentClusters.slice(0, 10)) {
      lines.push(`- ${c.label}：${c.explanation}（关键词：${c.keywords.join(', ')}；节点数：${c.nodeIds.length}）`);
    }
  }

  if (globalReview) {
    lines.push('全局审查记忆：');
    lines.push(`- 综合评分：${globalReview.score}/10；总结：${globalReview.summary}`);
    if (globalReview.issues.length > 0) {
      lines.push('- 关键问题：' + globalReview.issues.slice(0, 5).join('；'));
    }
    if (globalReview.nextSteps.length > 0) {
      lines.push('- 建议下一步：' + globalReview.nextSteps.slice(0, 5).join('；'));
    }
  }

  if (executionTasks && executionTasks.length > 0) {
    lines.push('执行任务状态：');
    for (const t of executionTasks.slice(0, 15)) {
      lines.push(`- ${t.title} [${t.status}] ${t.endDate ? '截止 ' + new Date(t.endDate).toLocaleDateString() : ''}`);
    }
  }

  return lines.join('\n');
}

export async function callReasonLLM(
  question: string,
  context: string,
  ownReasoning: string,
  llmSettings: {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
  }
): Promise<ReasonOutput> {
  const userParts = [`问题：${question}`];
  if (context) userParts.push(`\n当前知识图谱上下文：\n${context}`);
  if (ownReasoning?.trim()) userParts.push(`\n用户自己的初步推理：\n${ownReasoning.trim()}`);
  userParts.push(`\n请按系统指令输出结构化推理链与候选方向。`);

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: REASON_SYSTEM_PROMPT },
        { role: 'user', content: userParts.join('') },
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

  let parsed: Partial<ReasonOutput> = {};
  try {
    parsed = JSON.parse(json.content);
  } catch {
    throw new Error('AI 返回了非 JSON 输出，无法解析推理链');
  }

  const directions = (parsed.directions || []).map((d: any, i: number) => ({
    id: d.id || `dir-${i + 1}`,
    label: d.label || `方向 ${i + 1}`,
    description: d.description || '',
    estimatedImpact: d.estimatedImpact || '',
    risks: Array.isArray(d.risks) ? d.risks.filter((r: any) => typeof r === 'string') : [],
  }));

  return {
    title: parsed.title || '推理链',
    summary: parsed.summary || '',
    steps: (parsed.steps || []).map((s: any) => ({
      claim: s.claim || '未命名论断',
      reasoning: s.reasoning || '',
      confidence: ['high', 'medium', 'low'].includes(s.confidence) ? s.confidence : 'medium',
      suggestedEvidenceQuery: s.suggestedEvidenceQuery || '',
    })),
    directions: directions.length > 0 ? directions : [defaultDirection(parsed.title)],
  };
}

function defaultDirection(title?: string): ReasonDirectionOutput {
  return {
    id: 'dir-default',
    label: title || '默认方向',
    description: 'AI 未提供明确方向时使用的默认推理路径',
    estimatedImpact: '按默认推理链推进',
    risks: ['未经过方向比较'],
  };
}

export function threadFromOutput(
  question: string,
  output: ReasonOutput,
  ownReasoning?: string,
  context?: {
    selectedNodeId?: string | null;
    nodeIds?: string[];
    clusterIds?: string[];
    selectedDirectionId?: string;
  }
): Omit<ReasoningThread, 'id' | 'createdAt' | 'updatedAt' | 'status'> {
  const directionIds = output.directions.map((d) => d.id);
  const nodeIds = context?.nodeIds || (context?.selectedNodeId ? [context.selectedNodeId] : []);
  const clusterIds = context?.clusterIds || [];
  return {
    title: output.title,
    question,
    ownReasoning,
    activeLayer: 'association',
    steps: output.steps.map((s) => ({
      id: `step-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`,
      claim: s.claim,
      reasoning: s.reasoning,
      evidenceIds: [],
      confidence: s.confidence,
      suggestedEvidenceQuery: s.suggestedEvidenceQuery,
      status: 'pending',
      interventions: [],
      counterfactuals: [],
    })),
    aiDirections: output.directions,
    selectedDirectionId: context?.selectedDirectionId || directionIds[0],
    contextNodeIds: nodeIds,
    contextClusterIds: clusterIds,
  };
}
