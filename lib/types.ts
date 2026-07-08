export interface Attachment {
  id: string;
  type: 'pdf' | 'image' | 'video' | 'link' | 'note';
  name: string;
  /** For uploaded files: IndexedDB blob key */
  blobRef?: string;
  /** For external/AI-suggested links */
  url?: string;
  /** For text notes or extracted summary */
  content?: string;
  createdAt: number;
}

/** Legacy timeline event, kept for migration to ExecutionTask */
export interface TimelineEvent {
  id: string;
  title: string;
  date: string; // ISO date string YYYY-MM-DD or datetime
  description?: string;
  nodeId?: string; // optional linked graph node
  createdAt: number;
  updatedAt: number;
}

export interface GlobalReviewResult {
  summary: string;
  score: number;
  strengths: string[];
  issues: string[];
  nextSteps: string[];
  dimensions: { name: string; score: number; comment: string }[];
  createdAt?: number;
  updatedAt?: number;
}

export interface ExecutionTask {
  id: string;
  title: string;
  description?: string;
  /** Time axis */
  startDate: string; // ISO datetime
  endDate?: string;
  /** Distribution axes */
  importance: number; // 0-1
  urgency: number; // 0-1
  difficulty?: number; // 0-1
  risk?: number; // 0-1
  customMetrics: Record<string, number>;
  /** Associations */
  nodeId?: string;
  clusterId?: string;
  parentTaskId?: string;
  dependsOn?: string[];
  /** Execution */
  learningTools?: string[];
  deliverables?: string[];
  status: 'todo' | 'doing' | 'done' | 'blocked';
  /** 2D execution graph layout position */
  position?: { x: number; y: number };
  createdAt: number;
  updatedAt: number;
}

export type EvidenceSourceType = 'openalex' | 'arxiv' | 'pdf' | 'link' | 'manual';

export interface EvidenceItem {
  id: string;
  title: string;
  source: string;
  sourceType: EvidenceSourceType;
  summary: string;
  url?: string;
  credibility: 'high' | 'medium' | 'low';
  uncertainty?: UncertaintyDistribution;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type ReasoningConfidence = 'high' | 'medium' | 'low';
export type ReasoningStepStatus = 'pending' | 'approved' | 'rejected';
export type ReasoningThreadStatus = 'draft' | 'reviewing' | 'approved' | 'rejected';
export type ReasoningLayer = 'association' | 'intervention' | 'counterfactual';

export interface UncertaintyDistribution {
  type: 'normal' | 'uniform' | 'beta' | 'custom';
  params: Record<string, number>;
  confidence: number; // 0-1
  notes?: string;
}

export interface ReasoningPath {
  nodes: string[];
  edges: { source: string; target: string; label?: string }[];
  score: number;
  length: number;
  evidenceStrength: number;
}

export type ConflictActionType = 'create' | 'update' | 'block' | 'start';

export interface ConflictAction {
  id: string;
  title: string;
  description: string;
  actionType: ConflictActionType;
  /** When actionType is update/block/start, this is the target task id */
  taskId?: string;
  priority: 'high' | 'medium' | 'low';
  dueHint?: string;
}

export interface Conflict {
  id: string;
  type: 'fact' | 'logic' | 'probability' | 'source';
  evidenceA: string;
  evidenceB: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  resolutionSuggestions: string[];
  /** AI-suggested actions tied to the Gantt / execution state */
  suggestedActions?: ConflictAction[];
  status: 'detected' | 'resolved' | 'pending';
  createdAt: number;
}

export interface InterventionCard {
  id: string;
  variable: string;
  intervention: string;
  predictedOutcome: string;
  controlVariables: string[];
  status: 'draft' | 'tested' | 'confirmed' | 'rejected';
}

export interface CounterfactualCard {
  id: string;
  scenario: string;
  implication: string;
  boundaryCondition: string;
  vulnerability: string;
  status: 'draft' | 'reviewed';
}

export interface ReasoningStep {
  id: string;
  claim: string;
  reasoning: string;
  evidenceIds: string[];
  confidence: ReasoningConfidence;
  suggestedEvidenceQuery?: string;
  uncertainty?: UncertaintyDistribution;
  status: ReasoningStepStatus;
  /** L2: intervention reasoning */
  interventions: InterventionCard[];
  /** L3: counterfactual reasoning */
  counterfactuals: CounterfactualCard[];
}

export interface ReasoningDirection {
  id: string;
  label: string;
  description: string;
  estimatedImpact: string;
  risks: string[];
}

export interface ReasoningThread {
  id: string;
  title: string;
  question: string;
  ownReasoning?: string; // user's own reasoning before seeing AI output
  steps: ReasoningStep[];
  /** Currently active layer in the UI */
  activeLayer: ReasoningLayer;
  /** Currently active step id in the UI */
  activeStepId?: string;
  status: ReasoningThreadStatus;
  /** AI-generated candidate directions for the user to choose/modify */
  aiDirections?: ReasoningDirection[];
  selectedDirectionId?: string;
  /** Source context captured at creation time */
  contextNodeIds?: string[];
  contextClusterIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ContentItem {
  id: string;
  title: string;
  titleEn?: string;
  /** Main text: abstract, notes, excerpt, annotation, report, etc. */
  content: string;
  contentEn?: string;
  type: 'abstract' | 'note' | 'annotation' | 'excerpt' | 'summary' | 'report' | 'simulation' | 'plan' | 'evidence';
  /** Item-level tags, can be AI-assisted generated */
  tags: string[];
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GraphNode {
  id: string;
  label: string;
  labelEn?: string;
  type: 'concept' | 'principle' | 'meta' | 'paper' | 'note' | 'custom' | 'communication' | 'ai-brief';
  /** Short one-line description shown on graph hover */
  description?: string;
  descriptionEn?: string;
  color?: string;
  val?: number;
  /** Node importance grade for visual prioritization */
  grade?: 'core' | 'important' | 'normal' | 'peripheral';
  /** AI generation verification grade: Ⅰ direct, Ⅱ reviewed, Ⅲ strictly reviewed & modified */
  aiGrade?: 'Ⅰ' | 'Ⅱ' | 'Ⅲ';
  attachments: Attachment[];
  /** Zotero-like content items */
  contentItems: ContentItem[];
  /** If set, this node belongs to the sub-network of the parent node */
  parentId?: string;
  metadata: {
    source?: string;
    authors?: string[];
    /** Node-level tags */
    tags?: string[];
    createdAt: number;
    updatedAt: number;
  };
}

export interface GraphLink {
  source: string;
  target: string;
  label?: string;
  value?: number;
  /** Optional color for themed/cycle connections */
  color?: string;
  /** Theme tag used to group and split links */
  theme?: string;
  /** Link visual variant: default or cycle highlight */
  variant?: 'default' | 'cycle';
}

export interface AIGraphPayload {
  nodes: Array<Partial<GraphNode> & { id: string; label: string }>;
  links?: GraphLink[];
  explanation?: string;
}

export interface ContentCluster {
  id: string;
  label: string;
  color: string;
  explanation: string;
  nodeIds: string[];
  keywords: string[];
  /** 0-1 relevance / coherence score for the block */
  score?: number;
}

export interface AIReasoningPayload {
  title: string;
  question: string;
  summary?: string;
  steps: Array<{
    claim: string;
    reasoning: string;
    confidence?: 'high' | 'medium' | 'low';
    suggestedEvidenceQuery?: string;
    interventions?: Array<{
      variable: string;
      intervention: string;
      predictedOutcome?: string;
      controlVariables?: string[];
      status?: 'draft' | 'tested' | 'confirmed' | 'rejected';
    }>;
    counterfactuals?: Array<{
      scenario: string;
      implication?: string;
      boundaryCondition?: string;
      vulnerability?: string;
    }>;
  }>;
  explanation?: string;
}

export interface FocusSession {
  id: string;
  startedAt: number;
  endedAt: number;
  effectiveMs: number;
  visualFocusScore: number;
  fatigueScore: number;
  faceLostMs: number;
  lookingAwayMs: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodes: GraphNode[];
  links: GraphLink[];
  reasoningThreads?: ReasoningThread[];
  evidenceItems?: EvidenceItem[];
  executionTasks?: ExecutionTask[];
  changeLog?: ChangeLogEntry[];
  overviewReport?: string;
  globalReview?: GlobalReviewResult;
  contentClusters?: ContentCluster[];
  nebulaMode?: boolean;
  focusSessions?: FocusSession[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AITagPayload {
  tags: string[];
  explanation?: string;
}

export interface AISummaryPayload {
  title: string;
  summary: string;
  tags: string[];
}

export interface ChangeLogEntry {
  id: string;
  timestamp: number;
  /** User prompt that triggered the change */
  prompt: string;
  /** Human-readable summary of what changed */
  summary: string;
  /** Node labels that were added */
  nodesAdded: string[];
  /** Node labels that were updated */
  nodesUpdated: string[];
  /** Node labels that were removed */
  nodesRemoved: string[];
  /** Number of new links created */
  linksAdded: number;
}

export interface AgentPersona {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  systemPrompt: string;
  icon: string;
}

export interface AgentOpinion {
  personaId: string;
  content: string;
}

export interface AgentClusterResult {
  topic: string;
  opinions: AgentOpinion[];
  consensus: string;
  payload: AIGraphPayload;
}

export interface AutoDirection {
  id: string;
  label: string;
  description: string;
}

export interface AutoReviewResult {
  summary: string;
  nodeScores: Array<{ id: string; label: string; score: number; issue?: string }>;
  directions: AutoDirection[];
}

export interface AutoRound {
  round: number;
  payload: AIGraphPayload;
  review?: AutoReviewResult;
  consensus?: string;
  opinions?: AgentOpinion[];
}

export interface CognitiveTrainingConfig {
  enabled: boolean;
  /** Minimum seconds the user must read AI output before accepting */
  minReadSeconds: number;
  /** Require user to write a self-summary before nodes are applied */
  requireSelfSummary: boolean;
  /** Require user to manually create at least one node from the AI output */
  requireManualNode: boolean;
}

export interface TrainingSession {
  id: string;
  startedAt: number;
  totalAiInteractions: number;
  selfSummaries: number;
  manualNodes: number;
  minutesRead: number;
}

export interface AttentionSessionRecord {
  id: string;
  startTime: number;
  endTime: number;
  contentId: string;
  contentType: 'ai_output' | 'node_content' | 'pdf' | 'other';
  contentLength?: number;
  score: number;
  flags: string[];
  totalMs: number;
  focusMs: number;
  totalIdleMs: number;
  scrollCoverage: number;
  interactionCount: number;
}
