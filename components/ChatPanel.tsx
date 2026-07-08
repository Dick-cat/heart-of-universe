'use client';

import { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { ChatMessage, AIGraphPayload, AIReasoningPayload } from '@/lib/types';
import { SYSTEM_PROMPT, buildProjectContext } from '@/lib/llm';
import { TrainingGate } from './TrainingGate';

const CHAT_STORAGE_KEY = (projectId: string | null) =>
  `heart-of-universe-chat:${projectId || 'unsaved'}`;

const REASONING_SYSTEM_PROMPT = `你是一名推理链助手。请根据用户的问题和项目上下文，输出一段结构化推理链。

输出必须是 JSON，格式如下：
{
  "title": "推理线程标题",
  "question": "正在回答的问题",
  "summary": "对整体结论的简短中文概述",
  "steps": [
    {
      "claim": "该步骤的具体论断（可被证据支持或推翻）",
      "reasoning": "从已有信息到该论断的推导过程",
      "confidence": "high | medium | low",
      "suggestedEvidenceQuery": "用于搜索支持/反驳该论断的关键词（英文优先）",
      "interventions": [{"variable":"变量","intervention":"干预值","predictedOutcome":"预测结果","controlVariables":[],"status":"draft"}],
      "counterfactuals": [{"scenario":"反事实场景","implication":"推导后果","boundaryCondition":"边界条件","vulnerability":"隐藏漏洞"}]
    }
  ],
  "explanation": "面向用户的 Markdown 解释"
}

规则：
- 只输出 JSON，不要 Markdown 代码块。
- claim 必须具体可检验。
- reasoning 必须展示"为什么"，而不是重复结论。
- 使用中文输出。`;

function stripMarkdownFences(content: string): string {
  return content.replace(/^```(?:json)?\s*([\s\S]*?)```\s*$/g, '$1').trim();
}

const PRESETS = [
  {
    label: '系统入门',
    prompt: '我想系统学习这个话题，请生成一张从第一性原理出发的知识图谱，包含核心概念、关键原理和推荐学习资源。',
  },
  {
    label: '深挖原理',
    prompt: '请围绕当前选中的节点，深入解释其底层原理、与其他概念的关系，并推荐论文或视频。',
  },
  {
    label: '找学习资源',
    prompt: '请为当前话题推荐高质量的公开学习资源（文章、论文、视频链接），并生成对应的资源节点。',
  },
  {
    label: '查漏补缺',
    prompt: '根据现有图谱，指出我可能遗漏的关键前置知识或相关概念，并补充为节点。',
  },
  {
    label: '重新连接网络',
    prompt: '我已经合并了多个项目，请检查当前所有节点之间的关系，删除重复或低价值的节点，补充缺失的关系，并重新组织成一个结构清晰、关系连贯的知识网络。请优先建立节点之间的逻辑关联，必要时创建新的连接节点。',
  },
];

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'system', content: SYSTEM_PROMPT },
  ]);
  const [loading, setLoading] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<
    | { kind: 'graph'; data: AIGraphPayload }
    | { kind: 'reasoning'; data: AIReasoningPayload }
    | null
  >(null);
  const [lastPrompt, setLastPrompt] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const applyAIPayload = useGraphStore((s) => s.applyAIPayload);
  const applyAIReasoningPayload = useGraphStore((s) => s.applyAIReasoningPayload);
  const recordTrainingInteraction = useGraphStore((s) => s.recordTrainingInteraction);
  const cognitiveTraining = useGraphStore((s) => s.cognitiveTraining);
  const workspace = useGraphStore((s) => s.workspace);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const currentProjectId = useGraphStore((s) => s.currentProjectId);
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const llmProvider = useGraphStore((s) => s.llmProvider);
  const llmApiKey = useGraphStore((s) => s.llmApiKey);
  const llmBaseUrl = useGraphStore((s) => s.llmBaseUrl);
  const llmModel = useGraphStore((s) => s.llmModel);
  const setLLMSettings = useGraphStore((s) => s.setLLMSettings);
  // Load chat history for the current project
  useEffect(() => {
    const key = CHAT_STORAGE_KEY(currentProjectId);
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setMessages([{ role: 'system', content: SYSTEM_PROMPT }, ...parsed]);
          return;
        }
      } catch {
        // ignore parse errors
      }
    }
    setMessages([{ role: 'system', content: SYSTEM_PROMPT }]);
  }, [currentProjectId]);

  // Persist chat history whenever it changes
  useEffect(() => {
    const key = CHAT_STORAGE_KEY(currentProjectId);
    const toSave = messages.slice(1);
    localStorage.setItem(key, JSON.stringify(toSave));
  }, [messages, currentProjectId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingPayload]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    const prompt = input.trim();
    setInput('');
    setLoading(true);
    setPendingPayload(null);
    setLastPrompt(prompt);

    try {
      const projectContext = buildProjectContext(nodes, links, selectedNodeId);
      const messagesWithContext =
        workspace === 'graph'
          ? [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'system', content: `以下是当前项目的完整知识网络，请在回答时参考这些上下文：\n\n${projectContext}` },
              ...nextMessages.slice(1),
            ]
          : [
              { role: 'system', content: REASONING_SYSTEM_PROMPT },
              { role: 'system', content: `当前项目上下文：\n\n${projectContext}` },
              ...nextMessages.slice(1),
            ];

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesWithContext,
          provider: llmProvider,
          apiKey: llmApiKey,
          baseURL: llmBaseUrl,
          model: llmModel,
          responseFormat: 'json_object',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '请求失败');

      const content = json.content;
      recordTrainingInteraction();

      if (workspace === 'graph') {
        let payload: AIGraphPayload = { nodes: [], links: [] };
        try {
          payload = JSON.parse(stripMarkdownFences(content));
        } catch {
          payload = { nodes: [], links: [], explanation: content };
        }

        if (cognitiveTraining.enabled && (payload.nodes?.length || payload.explanation)) {
          setPendingPayload({ kind: 'graph', data: payload });
        } else {
          applyAIPayload(payload, prompt, 'Ⅰ');
          setMessages((prev) => [...prev, { role: 'assistant', content: payload.explanation || '已生成新节点。' }]);
        }
      } else {
        let payload: AIReasoningPayload = { title: 'AI 推理线程', question: prompt, steps: [], explanation: content };
        try {
          const parsed = JSON.parse(stripMarkdownFences(content));
          payload = { ...payload, ...parsed };
        } catch {
          // keep fallback with explanation
        }

        if (cognitiveTraining.enabled && (payload.steps?.length || payload.explanation)) {
          setPendingPayload({ kind: 'reasoning', data: payload });
        } else {
          applyAIReasoningPayload(payload, prompt);
          setMessages((prev) => [...prev, { role: 'assistant', content: payload.explanation || '已生成推理线程。' }]);
        }
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `[错误] ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const applyPending = (grade: import('@/lib/types').GraphNode['aiGrade']) => {
    if (!pendingPayload) return;
    if (pendingPayload.kind === 'graph') {
      applyAIPayload(pendingPayload.data, lastPrompt, grade);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: pendingPayload.data.explanation || '已生成新节点。' },
      ]);
    } else {
      applyAIReasoningPayload(pendingPayload.data, lastPrompt);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: pendingPayload.data.explanation || '已生成推理线程。' },
      ]);
    }
    setPendingPayload(null);
  };

  const cancelPending = () => {
    setPendingPayload(null);
    setMessages((prev) => [...prev, { role: 'assistant', content: '已取消应用 AI 输出。' }]);
  };

  const applyPreset = (prompt: string) => {
    let final = prompt;
    if (selectedNodeId) {
      final = `${prompt}\n当前选中节点 id: ${selectedNodeId}`;
    }
    setInput(final);
  };

  const clearProjectMemory = () => {
    if (!confirm('确定清除当前项目的 AI 对话记忆？此操作不可恢复。')) return;
    localStorage.removeItem(CHAT_STORAGE_KEY(currentProjectId));
    setMessages([{ role: 'system', content: SYSTEM_PROMPT }]);
  };

  return (
    <>
      {open && (
        <div className="fixed right-16 top-16 z-50 flex h-[500px] w-[400px] flex-col rounded-none border border-cosmic-700 bg-cosmic-900/95 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-panel-border/60 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-crimson-400">AI</span>
              <span className="font-bold tracking-wider text-cosmic-100">助手</span>
              {cognitiveTraining.enabled && (
                <span className="rounded-full bg-crimson-900/40 px-2 py-0.5 text-[10px] text-crimson-400">
                  训练中
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearProjectMemory}
                className="flex h-7 w-7 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-crimson-900/40 hover:text-crimson-300"
                title="清除当前项目对话记忆"
              >
                🗑
              </button>
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-cosmic-800 hover:text-cosmic-100"
                title="模型设置"
              >
                ⚙
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-cosmic-800 hover:text-cosmic-100"
              >
                ×
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="border-b border-panel-border/60 bg-cosmic-950/50 p-4 space-y-3">
              <div className="text-xs font-medium text-cosmic-300">模型设置</div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={llmProvider}
                  onChange={(e) => setLLMSettings({ provider: e.target.value })}
                  className="cosmic-input text-xs"
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="kimi">Kimi</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">自定义</option>
                </select>
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLLMSettings({ model: e.target.value })}
                  placeholder="模型名，如 deepseek-chat"
                  className="cosmic-input text-xs"
                />
              </div>
              <input
                type="password"
                value={llmApiKey}
                onChange={(e) => setLLMSettings({ apiKey: e.target.value })}
                placeholder="API Key"
                className="cosmic-input w-full text-xs"
              />
              <input
                type="text"
                value={llmBaseUrl}
                onChange={(e) => setLLMSettings({ baseURL: e.target.value })}
                placeholder="Base URL（可选，留空使用默认）"
                className="cosmic-input w-full text-xs"
              />
              <p className="text-[10px] text-cosmic-500">
                设置会自动保存。未填写 API Key 时使用环境变量配置。
                <br />
                对话记录已按项目隔离，切换项目不会读取其他项目的上下文。
              </p>
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-thin">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.prompt)}
                className="cosmic-pill shrink-0"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
            {messages.slice(1).map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-sm px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto bg-gradient-to-br from-crimson-600 to-crimson-800 text-white shadow-crimson-glow'
                    : 'border border-cosmic-700 bg-cosmic-800/80 text-cosmic-200'
                }`}
              >
                {m.content}
              </div>
            ))}

            {pendingPayload && (
              <TrainingGate
                contentLength={(pendingPayload.data.explanation || '').length}
                aiExplanation={
                  pendingPayload.data.explanation ||
                  (pendingPayload.kind === 'graph'
                    ? 'AI 已生成节点，请阅读后应用。'
                    : 'AI 已生成推理线程，请阅读后应用。')
                }
                onApply={applyPending}
                onCancel={cancelPending}
              />
            )}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-cosmic-400">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cosmic-600 border-t-crimson-500" />
                AI 正在思考…
              </div>
            )}
          </div>

          <div className="border-t border-panel-border/60 p-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="输入需求，或点击上方预设…"
              className="cosmic-input h-20 w-full resize-none"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim() || !!pendingPayload}
              className="cosmic-btn-primary mt-3 w-full"
            >
              {loading ? '生成中…' : pendingPayload ? '请先完成训练闭环' : '发送'}
            </button>
          </div>
        </div>
      )}
      <div className={`fixed right-4 top-16 z-50`}>
        <button
          onClick={() => setOpen(!open)}
          className="flex h-10 w-10 items-center justify-center rounded-none bg-gradient-to-br from-crimson-600 to-crimson-800 text-white shadow-crimson-glow transition-transform hover:scale-110 active:scale-95"
          style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
        >
          <span className="text-base">🤖</span>
        </button>
      </div>
    </>
  );
}
