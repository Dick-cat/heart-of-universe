import { GraphNode, GraphLink, Attachment, ContentItem } from './types';

export interface AIReviewIssue {
  dimension: 'source_credibility' | 'methodology' | 'consistency' | 'completeness' | 'network_embedding';
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  location: string;
  description: string;
  suggestion: string;
  howToVerify: string;
}

export interface AIReviewResult {
  verdict: 'trusted' | 'questionable' | 'needs_review' | 'insufficient_evidence';
  score: number;
  issues: AIReviewIssue[];
  strengths: string[];
}

export interface AIReviewInput {
  node: GraphNode;
  relatedNodes: GraphNode[];
  relatedLinks: GraphLink[];
  descendantNodes?: GraphNode[];
  llmSettings: {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
  };
}

export async function runAIEvidenceReview(input: AIReviewInput): Promise<AIReviewResult> {
  const { node, relatedNodes, relatedLinks, descendantNodes, llmSettings } = input;

  const prompt = buildEvidenceReviewPrompt(node, relatedNodes, relatedLinks, descendantNodes);

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: EVIDENCE_REVIEW_SYSTEM_PROMPT },
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
  if (!res.ok) throw new Error(json.error || 'AI 审查请求失败');

  const content = json.content || '{}';
  let parsed: AIReviewResult;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {
      verdict: 'needs_review',
      score: 0.5,
      issues: [
        {
          dimension: 'completeness',
          severity: 'minor',
          location: 'AI 审查输出',
          description: 'AI 返回了非 JSON 输出，需要人工检查。',
          suggestion: '重新运行审查，或手动评估节点质量。',
          howToVerify: '查看 AI 原始输出文本。',
        },
      ],
      strengths: [],
    };
  }

  return parsed;
}

const EVIDENCE_REVIEW_SYSTEM_PROMPT = `你是一名严格的学术/工程证据审查员。你的任务是对知识图谱中的一个节点及其关联进行结构化审查，并指出具体问题。

请根据以下五个维度进行评估：
1. source_credibility（来源可信度）：附件链接、引用的论文/数据来源是否可靠？是否 OA？是否有 DOI？
2. methodology（方法论严谨度）：研究方法、实验设计、指标、统计处理、可复现性是否清晰严谨？
3. consistency（论证一致性）：节点内容是否存在自相矛盾？结论是否超出证据？是否存在逻辑谬误？
4. completeness（证据完整度）：关键概念是否定义？是否考虑反例？是否标注局限性与边界？
5. network_embedding（网络嵌入度）：该节点是否与周边节点建立清晰关系？是否孤立？

输出必须是 JSON，格式如下：
{
  "verdict": "trusted | questionable | needs_review | insufficient_evidence",
  "score": 0.0-1.0,
  "issues": [
    {
      "dimension": "source_credibility",
      "severity": "critical | major | minor | suggestion",
      "location": "节点描述 / 某 contentItem / 某 attachment / 某子节点",
      "description": "具体问题",
      "suggestion": "改进建议",
      "howToVerify": "用户可执行的验证步骤"
    }
  ],
  "strengths": ["该节点的优点"]
}

规则：
- 只输出 JSON，不要 Markdown 代码块。
- 没有问题时 issues 为空数组，但 verdict 不应为 trusted 除非 score >= 0.8。
- 问题描述要具体，指出"哪里"和"为什么"。
- 建议必须可执行。
- 使用中文输出。`;

function buildEvidenceReviewPrompt(
  node: GraphNode,
  relatedNodes: GraphNode[],
  relatedLinks: GraphLink[],
  descendantNodes?: GraphNode[]
): string {
  const attachmentsText = node.attachments
    .map(
      (att) =>
        `- [${att.type}] ${att.name}${att.url ? ` (${att.url})` : ''}${att.blobRef ? ' (本地文件)' : ''}`
    )
    .join('\n') || '无';

  const contentText = node.contentItems
    .map((ci) => `- [${ci.type}] ${ci.title}: ${ci.content.slice(0, 300)}${ci.content.length > 300 ? '...' : ''}`)
    .join('\n') || '无';

  const relationsText = relatedLinks
    .map((l) => {
      const source = relatedNodes.find((n) => n.id === l.source)?.label || l.source;
      const target = relatedNodes.find((n) => n.id === l.target)?.label || l.target;
      return `- ${source} → ${target}${l.label ? ` (${l.label})` : ''}`;
    })
    .join('\n') || '无';

  const descendantsText =
    (descendantNodes || [])
      .map((n) => `- ${n.label} (${n.type})${n.description ? ': ' + n.description.slice(0, 80) : ''}`)
      .join('\n') || '无';

  return `请审查以下知识图谱节点：

节点名称：${node.label}
节点类型：${node.type}
描述：${node.description || '无'}

内容条目：
${contentText}

附件/来源：
${attachmentsText}

关联节点：
${relatedNodes.map((n) => `- ${n.label} (${n.type})`).join('\n') || '无'}

关系：
${relationsText}

子节点/下游节点：
${descendantsText}

请同时审查该节点及其子节点/下游节点的证据质量、一致性与论证完整性。按系统指令输出 JSON 审查结果。`;
}
