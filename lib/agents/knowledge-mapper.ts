import { Agent, AgentPersona, AgentTask, AgentResult, AgentMessage } from './types';
import { callAgentLLM } from './llm';

const persona: AgentPersona = {
  id: 'knowledge-mapper',
  name: '知识图谱员',
  nameEn: 'Knowledge Mapper',
  icon: 'KM',
  description: '把文本/目标转化为知识图谱节点与关系',
  systemPrompt: `你是一名知识图谱专家。你的任务是把用户输入的任何文本转化为结构化的知识图谱节点与关系。

输出必须是 JSON，格式如下：
{
  "explanation": "简短中文说明",
  "nodes": [
    {
      "label": "中文节点名",
      "labelEn": "English Name",
      "type": "concept|principle|paper|note|question",
      "description": "一句话中文描述",
      "descriptionEn": "One-sentence English description"
    }
  ],
  "links": [
    { "source": "节点A的label", "target": "节点B的label", "label": "关系中文" }
  ]
}

规则：
- 节点 id 使用 lower-case-kebab 格式，基于 label 生成。
- 节点和关系必须同时包含中文与英文。
- 每个节点必须有清晰的类型。
- 只输出 JSON，不要 Markdown 代码块。`,
};

function kebab(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const knowledgeMapperAgent: Agent = {
  id: 'knowledge-mapper',
  persona,
  async run(task): Promise<AgentResult> {
    const messages: AgentMessage[] = [];
    messages.push({
      from: 'knowledge-mapper',
      action: 'map',
      content: `正在把「${task.instruction}」转化为知识图谱…`,
      timestamp: Date.now(),
    });

    const { content, error } = await callAgentLLM(task.context, persona.systemPrompt, task.instruction);
    if (error) {
      return {
        success: false,
        agentId: 'knowledge-mapper',
        summary: '映射失败',
        messages,
        error,
      };
    }

    let parsed: { explanation?: string; nodes?: any[]; links?: any[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        success: false,
        agentId: 'knowledge-mapper',
        summary: 'LLM 返回了非 JSON 输出',
        messages,
        error: '无法解析 JSON',
      };
    }

    const nodes = (parsed.nodes || []).map((n: any) => ({
      id: `${kebab(n.label)}-${Date.now().toString(36)}`,
      label: n.label,
      labelEn: n.labelEn,
      type: n.type || 'concept',
      description: n.description,
      descriptionEn: n.descriptionEn,
    }));

    const nodeLabels = new Set(nodes.map((n) => n.label));
    const links = (parsed.links || [])
      .filter((l: any) => nodeLabels.has(l.source) && nodeLabels.has(l.target) && l.source !== l.target)
      .map((l: any) => ({
        source: nodes.find((n) => n.label === l.source)!.id,
        target: nodes.find((n) => n.label === l.target)!.id,
        label: l.label || '相关',
      }));

    messages.push({
      from: 'knowledge-mapper',
      action: 'report',
      content: parsed.explanation || `生成 ${nodes.length} 个节点、${links.length} 条关系`,
      metadata: { nodeCount: nodes.length, linkCount: links.length },
      timestamp: Date.now(),
    });

    return {
      success: true,
      agentId: 'knowledge-mapper',
      summary: `生成 ${nodes.length} 个节点、${links.length} 条关系`,
      messages,
      payload: { nodes, links },
    };
  },
};
