import { AgentContext } from './types';

export async function callAgentLLM(
  context: AgentContext,
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string; error?: string }> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        provider: context.llmSettings.provider,
        apiKey: context.llmSettings.apiKey,
        baseURL: context.llmSettings.baseURL,
        model: context.llmSettings.model,
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Agent LLM 请求失败');
    return { content: json.content || '' };
  } catch (err: any) {
    return { content: '', error: err.message };
  }
}
