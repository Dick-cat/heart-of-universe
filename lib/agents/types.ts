import { GraphNode, GraphLink } from '@/lib/types';

export type AgentId =
  | 'orchestrator'
  | 'academic-researcher'
  | 'knowledge-mapper'
  | 'evidence-reviewer'
  | 'experiment-designer'
  | 'writer';

export interface AgentPersona {
  id: AgentId;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  systemPrompt: string;
}

export interface AgentContext {
  projectGoal?: string;
  selectedNodeId?: string | null;
  nodes: GraphNode[];
  links: GraphLink[];
  llmSettings: {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
  };
}

export interface AgentTask {
  id: string;
  agentId: AgentId;
  instruction: string;
  context: AgentContext;
}

export interface AgentMessage {
  from: AgentId;
  action: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface AgentResult {
  success: boolean;
  agentId: AgentId;
  summary: string;
  messages: AgentMessage[];
  payload?: {
    nodes?: Partial<GraphNode>[];
    links?: Partial<GraphLink>[];
  };
  error?: string;
}

export interface Agent {
  id: AgentId;
  persona: AgentPersona;
  run: (task: AgentTask) => Promise<AgentResult>;
}
