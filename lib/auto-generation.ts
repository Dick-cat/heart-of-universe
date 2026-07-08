import { AIGraphPayload, AutoReviewResult, AgentClusterResult, AutoDirection } from './types';
import { ENGINEERING_AGENT_PERSONAS, AGENT_CLUSTER_SYSTEM_PROMPT } from './agent-personas';

export function stripMarkdownFences(content: string): string {
  return content.replace(/^```(?:json)?\s*([\s\S]*?)```\s*$/g, '$1').trim();
}

export function parseJSON<T>(content: string, fallback: T): T {
  try {
    return JSON.parse(stripMarkdownFences(content)) as T;
  } catch {
    return fallback;
  }
}

export function buildGenerationPrompt(theme: string, goal: string, count: number, context: string) {
  const personas = ENGINEERING_AGENT_PERSONAS.map(
    (p) => `- ${p.name}（${p.role}）`
  ).join('\n');

  const user = `主题：${theme || '未指定主题'}
目标：${goal || '构建一张围绕该主题的知识图谱'}
要求生成的节点数量：${count}

当前项目上下文：
${context || '当前项目为空。'}

请依次扮演以下 5 位专家进行讨论并输出结构化结果：
${personas}`;

  return {
    system: AGENT_CLUSTER_SYSTEM_PROMPT,
    user,
  };
}

export function parseAgentClusterResult(content: string): AgentClusterResult {
  const fallback: AgentClusterResult = {
    topic: '自动生成',
    opinions: [],
    consensus: '',
    payload: { nodes: [], links: [] },
  };
  const parsed = parseJSON<Partial<AgentClusterResult>>(content, fallback);
  const rawOpinions = Array.isArray(parsed.opinions) ? parsed.opinions : [];
  const opinions = rawOpinions
    .filter((op): op is { personaId: string; content: string } => op && typeof op === 'object')
    .map((op) => ({
      personaId: String(op.personaId || ''),
      content: String(op.content || ''),
    }));
  return {
    topic: parsed.topic || fallback.topic,
    opinions,
    consensus: parsed.consensus || '',
    payload: normalizePayload(parsed.payload),
  };
}

export function buildReviewPrompt(payload: AIGraphPayload, goal: string) {
  const nodesText = (payload.nodes || [])
    .map(
      (n, i) =>
        `${i + 1}. [${n.id || 'no-id'}] ${n.label || '未命名'} (${n.type || 'concept'}) — ${
          n.description || '无描述'
        }`
    )
    .join('\n');

  const system = `你是一名严格的知识图谱审查员。请审查一批已生成的节点，并给出改进方向。

输出必须是 JSON，格式如下：
{
  "summary": "对整批节点的中文评价",
  "nodeScores": [
    { "id": "节点id", "label": "节点名", "score": 7, "issue": "可选：主要问题" }
  ],
  "directions": [
    { "id": "dir-1", "label": "方向标题", "description": "该方向能解决什么问题、值得深入" }
  ]
}

规则：
- score 为 1-10 的整数，10 分最高。
- directions 给出 3-5 个第二轮生成方向，每个方向必须具体、可执行。
- 只输出 JSON，不要 Markdown 代码块。`;

  const user = `生成目标：${goal || '构建知识图谱'}\n\n待审查节点：\n${nodesText || '无节点'}\n\n请输出审查结果与二轮生成方向。`;

  return { system, user };
}

export function parseReviewResult(content: string): AutoReviewResult {
  const fallback: AutoReviewResult = {
    summary: '审查失败',
    nodeScores: [],
    directions: [],
  };
  const parsed = parseJSON<Partial<AutoReviewResult>>(content, fallback);
  return {
    summary: parsed.summary || fallback.summary,
    nodeScores: Array.isArray(parsed.nodeScores)
      ? parsed.nodeScores
          .filter((n) => n && typeof n === 'object')
          .map((n) => ({
            id: String(n.id || ''),
            label: String(n.label || ''),
            score: Math.max(1, Math.min(10, Number(n.score) || 5)),
            issue: n.issue ? String(n.issue) : undefined,
          }))
      : [],
    directions: (Array.isArray(parsed.directions) ? parsed.directions : [])
      .filter((d): d is AutoDirection => Boolean(d && d.label))
      .map((d, i) => ({
        id: d.id || `dir-${i + 1}`,
        label: d.label,
        description: d.description || '',
      })),
  };
}

export function buildExpansionPrompt(
  theme: string,
  selectedDirections: AutoDirection[],
  existingPayload: AIGraphPayload,
  count: number
) {
  const directionsText = selectedDirections
    .map((d) => `- ${d.label}：${d.description}`)
    .join('\n');

  const existingNodesText = (existingPayload.nodes || [])
    .map((n) => `- [${n.id}] ${n.label} (${n.type || 'concept'})`)
    .join('\n');

  const system = `你是一名知识图谱专家。用户已经生成了一批节点，现在需要你基于选定的方向继续扩展。

输出必须是 JSON，格式与标准知识图谱 payload 一致：
{
  "explanation": "简短中文说明",
  "nodes": [
    {
      "id": "lower-case-kebab",
      "label": "中文节点名",
      "labelEn": "English Name",
      "type": "concept|principle|meta|paper|note|communication|ai-brief",
      "description": "一句话中文描述",
      "descriptionEn": "One-sentence English description",
      "contentItems": [
        { "title": "中文标题", "titleEn": "English Title", "content": "中文内容", "contentEn": "English content", "type": "abstract", "tags": ["中文标签", "english-tag"] }
      ]
    }
  ],
  "links": [
    { "source": "node-a-id", "target": "node-b-id", "label": "关系中文" }
  ]
}

规则：
- 节点必须同时包含中文与英文字段。
- 新增节点要尽量与已有节点建立关系，必要时创建桥接节点。
- 节点 id 使用小写短横线格式，并在 links 中正确引用。
- 只输出 JSON，不要 Markdown 代码块。`;

  const user = `主题：${theme || '未指定主题'}
已选定的深入方向：
${directionsText || '未指定方向'}

已有节点：
${existingNodesText || '无'}

请再生成 ${count} 个新节点，并输出它们与已有节点之间的关系。`;

  return { system, user };
}

export function normalizePayload(payload?: Partial<AIGraphPayload>): AIGraphPayload {
  const rawNodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  return {
    explanation: payload?.explanation || '',
    nodes: rawNodes.map((n) => ({
      ...(n || {}),
      label: String(n?.label || n?.id || '未命名节点'),
    })) as AIGraphPayload['nodes'],
    links: Array.isArray(payload?.links) ? payload.links : [],
  };
}

export function mergePayloads(a: AIGraphPayload, b: AIGraphPayload): AIGraphPayload {
  const existingIds = new Set((a.nodes || []).map((n) => n.id));
  const newNodes = (b.nodes || []).filter((n) => n.id && !existingIds.has(n.id));
  return {
    explanation: [a.explanation, b.explanation].filter(Boolean).join('\n\n'),
    nodes: [...(a.nodes || []), ...newNodes],
    links: [...(a.links || []), ...(b.links || [])],
  };
}
