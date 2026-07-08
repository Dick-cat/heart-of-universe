import { AIGraphPayload, ContentItem, GraphNode, GraphLink } from './types';

export const SYSTEM_PROMPT = `You are an AI assistant that helps Chinese users build a bilingual knowledge graph for learning principles and meta-knowledge. You are given the current project's complete knowledge network (nodes and links) as context, so answer based on the whole project, not just a single node.

When the user asks about a topic, respond with a JSON object in this exact shape:

{
  "explanation": "A short, friendly summary in Chinese.",
  "nodes": [
    {
      "id": "unique-id-lowercase",
      "label": "中文名称",
      "labelEn": "English Name",
      "type": "concept" | "principle" | "meta" | "paper" | "note" | "communication" | "ai-brief",
      "description": "1 sentence in Chinese",
      "descriptionEn": "1 sentence in English",
      "parentId": "optional-parent-node-id",
      "contentItems": [
        {
          "title": "中文标题",
          "titleEn": "English Title",
          "content": "内容用中文写。",
          "contentEn": "English version of the content.",
          "type": "abstract" | "report" | "simulation" | "plan" | "evidence",
          "tags": ["中文标签", "english-tag"],
          "sourceUrl": "https://optional-source-url"
        }
      ],
      "attachments": [
        {
          "type": "link",
          "name": "Useful resource title",
          "url": "https://example.com/article"
        }
      ]
    }
  ],
  "links": [
    { "source": "node-a-id", "target": "node-b-id", "label": "relates to" }
  ]
}

Rules:
- Always return valid JSON only. Do not wrap it in markdown code blocks.
- Every node MUST include both Chinese (label, description, contentItems.title/content) and English (labelEn, descriptionEn, contentItems.titleEn/contentEn) fields.
- Create nodes that help the user systematically understand the topic from first principles.
- For each node, include at least one contentItem of type "abstract" with useful bilingual tags.
- Use attachment links when you know a high-quality public resource (paper, video, article).
- Keep the first explanation concise (under 80 words).
- HIERARCHY: Use "parentId" to nest detail/low-level nodes under top-level parent nodes. Top-level nodes have no parentId. If the user asks to organize the graph, prefer moving existing low-level nodes under appropriate top-level nodes by setting their parentId instead of duplicating them.
- DO NOT return nodes that already exist with the same id. If a node already exists, update its parentId or links instead of creating a duplicate.`;

export const TAG_ASSISTANT_PROMPT = `You are a tagging assistant. Given a piece of text, suggest 3-8 concise, relevant bilingual tags and a one-sentence explanation.

Respond with JSON only:
{
  "tags": ["中文标签", "english-tag"],
  "explanation": "why these tags fit"
}`;

export const SUMMARY_ASSISTANT_PROMPT = `You are a summarization assistant. Given a text, produce a concise bilingual summary suitable for a knowledge graph content item.

Respond with JSON only:
{
  "title": "中文短标题",
  "titleEn": "English Title",
  "summary": "中文摘要",
  "summaryEn": "English summary",
  "tags": ["中文标签", "english-tag"]
}`;

export function buildProjectContext(
  nodes: GraphNode[],
  links: GraphLink[],
  selectedNodeId: string | null
): string {
  if (nodes.length === 0) {
    return '当前项目还没有任何节点。';
  }

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  let context = `当前项目共有 ${nodes.length} 个节点，${links.length} 条关系。\n\n节点列表：\n`;
  for (const node of nodes) {
    const desc = node.description ? `：${node.description.slice(0, 80)}` : '';
    const parentInfo = node.parentId ? ` [parentId=${node.parentId}]` : ' [top-level]';
    context += `- [${node.id}] ${node.label} (${node.type})${parentInfo}${desc}\n`;
  }

  if (links.length > 0) {
    context += `\n关系列表：\n`;
    for (const link of links) {
      const source = nodeMap.get(link.source as string)?.label || link.source;
      const target = nodeMap.get(link.target as string)?.label || link.target;
      context += `- ${source} → ${target}${link.label ? `（${link.label}）` : ''}\n`;
    }
  }

  if (selectedNode) {
    context += `\n当前选中节点：[${selectedNode.id}] ${selectedNode.label}\n`;
    if (selectedNode.contentItems?.length) {
      context += `该节点内容摘要：\n`;
      for (const item of selectedNode.contentItems.slice(0, 5)) {
        const content = (item.content || '').slice(0, 120);
        context += `- ${item.title}：${content}\n`;
      }
    }
  }

  return context;
}

export function mergeAIPayload(
  existingNodes: any[],
  payload: AIGraphPayload,
  aiGrade?: import('./types').GraphNode['aiGrade']
): { nodes: any[]; links: any[] } {
  const payloadNodes = (payload?.nodes || []) as any[];

  // Build a map from AI's id/label to a stable generated id
  const idMap = new Map<string, string>();
  payloadNodes.forEach((n) => {
    const label = n?.label || n?.id || '未命名节点';
    const generatedId = n?.id || slugify(label);
    if (n?.id) idMap.set(n.id, generatedId);
    idMap.set(label, generatedId);
  });

  const existingNodeIds = new Set(existingNodes.map((n) => n.id));

  const newNodes = payloadNodes.map((n) => {
    const label = n?.label || n?.id || '未命名节点';
    const id = idMap.get(n?.id || label) || generateNodeId();
    const isNew = !existingNodeIds.has(id);
    return {
      ...n,
      id,
      label,
      type: n?.type || 'concept',
      parentId: n?.parentId ? idMap.get(n.parentId) || n.parentId : undefined,
      aiGrade: isNew && aiGrade ? aiGrade : n?.aiGrade,
      attachments: Array.isArray(n?.attachments) ? n.attachments : [],
      contentItems: Array.isArray(n?.contentItems)
        ? n.contentItems.map((ci: any) => ({
            ...ci,
            title: ci?.title || '',
            content: ci?.content || '',
            id: `ci-${Math.random().toString(36).slice(2, 9)}`,
            tags: ci?.tags || [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }))
        : [],
      metadata: {
        ...(n?.metadata || {}),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
  });

  // Resolve links using the idMap
  const resolvedLinks = (payload.links || [])
    .map((l) => ({
      ...l,
      source: idMap.get(l.source) || l.source,
      target: idMap.get(l.target) || l.target,
      label: (l as any).label || (l as any).relationship || undefined,
    }))
    .filter((l) => l.source && l.target && l.source !== l.target);

  // Avoid duplicates by id; update existing if AI returns the same id
  const merged = [...existingNodes];
  for (const node of newNodes) {
    const idx = merged.findIndex((n) => n.id === node.id);
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...node, metadata: { ...merged[idx].metadata, ...node.metadata, updatedAt: Date.now() } };
    } else {
      merged.push(node);
    }
  }

  return { nodes: merged, links: resolvedLinks };
}

function slugify(text: string | undefined | null): string {
  const t = typeof text === 'string' ? text : String(text ?? '');
  return t
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || generateNodeId();
}

function generateNodeId(): string {
  return `ai-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}
