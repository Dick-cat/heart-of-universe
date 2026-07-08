import { GraphNode, ContentCluster } from './types';
import { stripMarkdownFences } from './auto-generation';

export interface ClusterNodesInput {
  nodes: GraphNode[];
  provider: string;
  apiKey: string;
  baseURL?: string;
  model?: string;
}

function buildNodeText(node: GraphNode): string {
  const parts: string[] = [];
  parts.push(`[${node.id}] ${node.label}`);
  if (node.description) parts.push(`描述：${node.description}`);
  if (node.metadata?.tags?.length) parts.push(`标签：${node.metadata.tags.join(', ')}`);
  for (const item of node.contentItems || []) {
    const snippet = `${item.title || ''} ${item.content || ''} ${(item.tags || []).join(', ')}`.trim();
    if (snippet) parts.push(snippet.slice(0, 240));
  }
  return parts.join('\n');
}

export async function clusterNodesByContent(input: ClusterNodesInput): Promise<ContentCluster[]> {
  const { nodes, provider, apiKey, baseURL, model } = input;
  if (nodes.length === 0) return [];
  if (!apiKey) throw new Error('请先配置 LLM API Key');

  const nodeTexts = nodes.map((n) => ({ id: n.id, text: buildNodeText(n) }));

  const prompt = `你是一名知识图谱内容分析师。请根据以下节点的文本内容，将语义相近、主题相关的节点划分为 2–8 个内容区块（content block）。

要求：
- 每个区块给出简短的中文名称、代表色（hex，如 #ef4444）、解释说明、包含的节点 id 列表、3–6 个关键词。
- 为每个区块打一个 0–1 之间的相关程度分数（1 表示内部节点高度相关）。
- 一个节点可以只属于一个最相关的区块。
- 如果节点数量太少或内容差异过大，允许返回较少的区块。

节点数据（每段以 [id] 开头）：
${nodeTexts.map((n) => `---\n${n.text}`).join('\n')}

请严格返回 JSON，不要包含 markdown 代码块：
{
  "blocks": [
    {
      "id": "block-1",
      "label": "区块名称",
      "color": "#3b82f6",
      "explanation": "该区块节点共同围绕…",
      "nodeIds": ["node-id-1", "node-id-2"],
      "keywords": ["关键词1", "关键词2"],
      "score": 0.85
    }
  ]
}`;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a knowledge graph content analyst. Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      provider,
      apiKey,
      baseURL,
      model,
      responseFormat: 'json_object',
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'LLM 请求失败');

  const parsed = JSON.parse(stripMarkdownFences(json.content || '{}'));
  const blocks: ContentCluster[] = (parsed.blocks || []).map((b: any) => ({
    id: b.id || `block-${Math.random().toString(36).slice(2, 7)}`,
    label: b.label || '未命名区块',
    color: b.color || '#94a3b8',
    explanation: b.explanation || '',
    nodeIds: Array.isArray(b.nodeIds) ? b.nodeIds : [],
    keywords: Array.isArray(b.keywords) ? b.keywords : [],
    score: typeof b.score === 'number' ? b.score : undefined,
  }));

  return blocks;
}

/** Build a node-id -> cluster lookup map for rendering. */
export function buildNodeClusterMap(clusters: ContentCluster[]): Map<string, ContentCluster> {
  const map = new Map<string, ContentCluster>();
  for (const cluster of clusters) {
    for (const nodeId of cluster.nodeIds) {
      map.set(nodeId, cluster);
    }
  }
  return map;
}
