import { Agent, AgentPersona, AgentTask, AgentResult, AgentMessage } from './types';
import { callAgentLLM } from './llm';

const persona: AgentPersona = {
  id: 'orchestrator',
  name: '项目教练',
  nameEn: 'Project Coach',
  icon: 'OC',
  description: '解析目标、制定计划、调度其他 Agent',
  systemPrompt: `你是一名项目教练（Orchestrator）。你的任务是：
1. 理解用户的目标或问题。
2. 判断完成该目标需要哪些专家 Agent（学术研究员、知识图谱员、证据审查员、实验设计师）。
3. 为每个 Agent 生成清晰的子任务指令。
4. 输出执行计划，供系统按顺序或并行调用 Agent。

输出 JSON 格式：
{
  "understanding": "对用户目标的简短理解",
  "plan": [
    { "agentId": "academic-researcher|knowledge-mapper|evidence-reviewer|experiment-designer", "instruction": "具体子任务" }
  ],
  "notes": "额外说明"
}

只输出 JSON，不要 Markdown 代码块。`,
};

export const orchestratorAgent: Agent = {
  id: 'orchestrator',
  persona,
  async run(task): Promise<AgentResult> {
    const messages: AgentMessage[] = [];
    messages.push({
      from: 'orchestrator',
      action: 'plan',
      content: `正在分析目标「${task.instruction}」并制定 Agent 执行计划…`,
      timestamp: Date.now(),
    });

    const prompt = `用户目标：${task.instruction}\n\n当前图谱节点数：${task.context.nodes.length}，关系数：${task.context.links.length}。\n\n请制定执行计划。`;
    const { content, error } = await callAgentLLM(task.context, persona.systemPrompt, prompt);

    if (error) {
      return {
        success: false,
        agentId: 'orchestrator',
        summary: '计划制定失败',
        messages,
        error,
      };
    }

    messages.push({
      from: 'orchestrator',
      action: 'report',
      content,
      timestamp: Date.now(),
    });

    return {
      success: true,
      agentId: 'orchestrator',
      summary: '已制定 Agent 执行计划',
      messages,
    };
  },
};
