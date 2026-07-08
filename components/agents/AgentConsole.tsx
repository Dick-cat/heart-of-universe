'use client';

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import {
  AgentId,
  AgentResult,
  AgentTask,
  academicResearcherAgent,
  knowledgeMapperAgent,
  orchestratorAgent,
} from '@/lib/agents';
import { generateId } from '@/lib/graph-utils';

const AVAILABLE_AGENTS: { id: AgentId; name: string; icon: string }[] = [
  { id: 'orchestrator', name: '项目教练', icon: 'OC' },
  { id: 'academic-researcher', name: '学术研究员', icon: 'RS' },
  { id: 'knowledge-mapper', name: '知识图谱员', icon: 'KM' },
];

export function AgentConsole() {
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('academic-researcher');
  const [instruction, setInstruction] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);

  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);
  const addNode = useGraphStore((s) => s.addNode);
  const addLink = useGraphStore((s) => s.addLink);
  const setReasoningPanelOpen = useGraphStore((s) => s.setReasoningPanelOpen);

  const runAgent = async () => {
    if (!instruction.trim()) return;
    setRunning(true);
    setResult(null);

    const task: AgentTask = {
      id: generateId('task'),
      agentId: selectedAgent,
      instruction,
      context: {
        nodes,
        links,
        selectedNodeId,
        llmSettings: {
          provider: llmProvider,
          apiKey: llmApiKey,
          baseURL: llmBaseUrl,
          model: llmModel,
        },
      },
    };

    let res: AgentResult;
    switch (selectedAgent) {
      case 'orchestrator':
        res = await orchestratorAgent.run(task);
        break;
      case 'academic-researcher':
        res = await academicResearcherAgent.run(task);
        break;
      case 'knowledge-mapper':
        res = await knowledgeMapperAgent.run(task);
        break;
      default:
        res = {
          success: false,
          agentId: selectedAgent,
          summary: '未知 Agent',
          messages: [],
          error: '该 Agent 尚未实现',
        };
    }

    setResult(res);
    setRunning(false);
  };

  const importPayload = () => {
    if (!result?.payload) return;
    result.payload.nodes?.forEach((n) => addNode(n));
    result.payload.links?.forEach((l) => addLink(l as any));
    alert(`已导入 ${result.payload.nodes?.length || 0} 个节点、${result.payload.links?.length || 0} 条关系`);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setReasoningPanelOpen(true)}
          className="rounded-sm border border-cosmic-700 bg-cosmic-800/40 px-2 py-1.5 text-xs text-cosmic-300 hover:bg-cosmic-700"
        >
          打开推理画布
        </button>
        {AVAILABLE_AGENTS.map((agent) => (
          <button
            key={agent.id}
            onClick={() => setSelectedAgent(agent.id)}
            className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs transition-colors ${
              selectedAgent === agent.id
                ? 'bg-crimson-700 text-white'
                : 'border border-cosmic-700 bg-cosmic-800/40 text-cosmic-300 hover:bg-cosmic-700'
            }`}
          >
            <span className="rounded-sm bg-cosmic-950 px-1 text-[10px]">{agent.icon}</span>
            <span>{agent.name}</span>
          </button>
        ))}
      </div>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="输入任务，例如：调研 Transformer 在蛋白质结构预测中的应用，并生成知识图谱"
        className="cosmic-input min-h-[60px] resize-y text-xs"
      />

      <button
        onClick={runAgent}
        disabled={running || !instruction.trim()}
        className="self-start rounded-sm bg-crimson-700 px-4 py-1.5 text-xs text-white transition-colors hover:bg-crimson-600 disabled:opacity-50"
      >
        {running ? '执行中…' : '运行 Agent'}
      </button>

      {result && (
        <div className="flex-1 overflow-y-auto rounded-sm border border-cosmic-800 bg-cosmic-950/40 p-3 scrollbar-thin">
          <div className={`mb-2 text-xs font-bold ${result.success ? 'text-emerald-400' : 'text-crimson-400'}`}>
            {result.success ? '✓' : '✗'} {result.summary}
          </div>
          {result.error && <div className="mb-2 text-xs text-crimson-300">错误：{result.error}</div>}

          <div className="space-y-2">
            {result.messages.map((m, i) => (
              <div key={i} className="rounded-sm border border-cosmic-800 bg-cosmic-900/50 p-2">
                <div className="mb-1 flex items-center gap-2 text-[10px] text-cosmic-500">
                  <span className="rounded-sm bg-cosmic-800 px-1 py-0.5">{m.from}</span>
                  <span>{m.action}</span>
                </div>
                <div className="whitespace-pre-wrap text-xs leading-relaxed text-cosmic-200">{m.content}</div>
              </div>
            ))}
          </div>

          {result.payload && result.payload.nodes && result.payload.nodes.length > 0 && (
            <button
              onClick={importPayload}
              className="mt-3 rounded-sm bg-emerald-700/80 px-3 py-1.5 text-xs text-white transition-colors hover:bg-emerald-600"
            >
              导入图谱
            </button>
          )}
        </div>
      )}
    </div>
  );
}
