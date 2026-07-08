import { NextRequest, NextResponse } from 'next/server';
import { ChatMessage } from '@/lib/types';

const DEFAULTS: Record<string, { baseURL: string; model: string }> = {
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  kimi: {
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages }: { messages: ChatMessage[] } = body;

    const provider = body.provider || process.env.LLM_PROVIDER || 'deepseek';
    const apiKey = body.apiKey || process.env.LLM_API_KEY;
    const baseURL = body.baseURL || process.env.LLM_BASE_URL || DEFAULTS[provider]?.baseURL;
    const model = body.model || process.env.LLM_MODEL || DEFAULTS[provider]?.model;

    if (!apiKey || !baseURL || !model) {
      return NextResponse.json(
        { error: 'Missing LLM configuration. Set LLM_PROVIDER, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL.' },
        { status: 400 }
      );
    }

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: `LLM request failed: ${response.status} ${text}` }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    return NextResponse.json({ content });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
