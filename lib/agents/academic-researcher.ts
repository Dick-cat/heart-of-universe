import { Agent, AgentId, AgentPersona, AgentTask, AgentResult, AgentMessage } from './types';
import { callAgentLLM } from './llm';
import { searchAcademicAll, AcademicPaper } from '@/lib/academic-search';

const persona: AgentPersona = {
  id: 'academic-researcher',
  name: '学术研究员',
  nameEn: 'Academic Researcher',
  icon: 'RS',
  description: '搜索学术文献、提取关键论断、评估方法学',
  systemPrompt: `你是一名学术研究员。你的任务是：
1. 基于用户提供的主题，分析需要检索的核心概念。
2. 对提供的论文列表，提取每篇论文的核心贡献、方法、局限性。
3. 评估哪些论文最相关、最可信。
4. 输出结构化的文献综述摘要。
输出使用中文，必要时提供英文术语。`,
};

export const academicResearcherAgent: Agent = {
  id: 'academic-researcher',
  persona,
  async run(task): Promise<AgentResult> {
    const messages: AgentMessage[] = [];
    messages.push({
      from: 'academic-researcher',
      action: 'search',
      content: `正在搜索与「${task.instruction}」相关的学术文献…`,
      timestamp: Date.now(),
    });

    let papers: AcademicPaper[] = [];
    try {
      papers = await searchAcademicAll({ query: task.instruction, limit: 8 });
    } catch (err: any) {
      return {
        success: false,
        agentId: 'academic-researcher',
        summary: '学术搜索失败',
        messages,
        error: err.message,
      };
    }

    messages.push({
      from: 'academic-researcher',
      action: 'report',
      content: `找到 ${papers.length} 篇相关文献`,
      metadata: { papers: papers.map((p) => ({ title: p.title, source: p.source, year: p.year })) },
      timestamp: Date.now(),
    });

    const paperText = papers
      .map(
        (p, i) =>
          `${i + 1}. ${p.title} (${p.source}, ${p.year || 'unknown'})\nAuthors: ${p.authors.join(', ')}\nAbstract: ${p.abstract.slice(0, 500)}`
      )
      .join('\n\n');

    const prompt = `主题：${task.instruction}\n\n已检索到的文献：\n${paperText}\n\n请输出：
1. 核心概念定义
2. 每篇文献的一句话贡献
3. 方法学趋势
4. 主要争议或空白
5. 最值得深入阅读的 3 篇论文及原因`;

    const { content, error } = await callAgentLLM(task.context, persona.systemPrompt, prompt);
    if (error) {
      return {
        success: false,
        agentId: 'academic-researcher',
        summary: '分析失败',
        messages,
        error,
      };
    }

    messages.push({
      from: 'academic-researcher',
      action: 'report',
      content,
      timestamp: Date.now(),
    });

    return {
      success: true,
      agentId: 'academic-researcher',
      summary: `完成「${task.instruction}」的学术调研，找到 ${papers.length} 篇文献`,
      messages,
    };
  },
};
