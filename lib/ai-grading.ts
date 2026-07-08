/**
 * AI 生成内容分级与关系判断模块
 *
 * 本模块定义知识图谱中 AI 生成节点与关系的可信度分级标准，
 * 并提供将原始 LLM 输出映射到统一等级的工具函数。
 *
 * 分级体系（罗马数字）：
 * - Ⅰ 直接生成：LLM 直接输出，未经人工或外部验证。
 * - Ⅱ 审查通过：经过证据审查、冲突检测或人工快速校验，未发现明显问题。
 * - Ⅲ 严格审查并修改：经过多轮审查、证据核对或人工深度修改后确认。
 *
 * 关系判断维度：
 * - 直接依赖（depends_on）：目标节点是源节点的前提或输入。
 * - 支持（supports）：源节点证据支持目标节点结论。
 * - 反驳（refutes）：源节点证据与目标节点结论冲突。
 * - 相关（related）：主题相关，但无明确因果或证据关系。
 * - 派生（derived）：目标节点由源节点推理派生。
 */

import { GraphNode, GraphLink, ExecutionTask } from './types';

export type AIGrade = 'Ⅰ' | 'Ⅱ' | 'Ⅲ';

export interface AIGradeDefinition {
  grade: AIGrade;
  label: string;
  description: string;
  verificationRequirement: string;
  color: string;
}

export const AI_GRADE_DEFINITIONS: AIGradeDefinition[] = [
  {
    grade: 'Ⅰ',
    label: '直接生成',
    description: '由 AI 直接生成，尚未经过证据审查或人工校验。',
    verificationRequirement: '需要至少一次快速事实核查或证据关联。',
    color: '#ef4444', // red
  },
  {
    grade: 'Ⅱ',
    label: '审查通过',
    description: '已通过证据审查、冲突检测或人工快速校验，无显著问题。',
    verificationRequirement: '建议补充更多来源或进行第二轮审查后升级为 Ⅲ。',
    color: '#f59e0b', // amber
  },
  {
    grade: 'Ⅲ',
    label: '严格审查并修改',
    description: '经过多轮审查、证据核对或人工深度修改，可信度最高。',
    verificationRequirement: '可作为推理链和报告的核心依据。',
    color: '#10b981', // emerald
  },
];

export const AI_GRADE_MAP = new Map<AIGrade, AIGradeDefinition>(
  AI_GRADE_DEFINITIONS.map((d) => [d.grade, d])
);

export function getAIGradeDefinition(grade?: AIGrade | string): AIGradeDefinition | undefined {
  if (!grade) return undefined;
  return AI_GRADE_MAP.get(grade as AIGrade);
}

export function getAIGradeColor(grade?: AIGrade | string): string {
  return getAIGradeDefinition(grade)?.color ?? '#94a3b8';
}

export function getAIGradeLabel(grade?: AIGrade | string): string {
  return getAIGradeDefinition(grade)?.label ?? '未分级';
}

/**
 * 根据节点审查结果自动推导 AI 等级。
 * - score >= 0.8 且无关键问题 → Ⅲ
 * - score >= 0.6 且无关键问题 → Ⅱ
 * - 其他 → Ⅰ
 */
export function inferAIGradeFromReview(score: number, hasCriticalIssue: boolean): AIGrade {
  if (!hasCriticalIssue && score >= 0.8) return 'Ⅲ';
  if (!hasCriticalIssue && score >= 0.6) return 'Ⅱ';
  return 'Ⅰ';
}

export type RelationType = 'depends_on' | 'supports' | 'refutes' | 'related' | 'derived';

export interface RelationJudgment {
  sourceId: string;
  targetId: string;
  relation: RelationType;
  confidence: number; // 0-1
  evidence?: string;
}

export const RELATION_DEFINITIONS: Record<RelationType, { label: string; color: string; description: string }> = {
  depends_on: {
    label: '依赖',
    color: '#64748b',
    description: '目标节点是源节点的前提或输入。',
  },
  supports: {
    label: '支持',
    color: '#10b981',
    description: '源节点证据支持目标节点结论。',
  },
  refutes: {
    label: '反驳',
    color: '#ef4444',
    description: '源节点证据与目标节点结论冲突。',
  },
  related: {
    label: '相关',
    color: '#94a3b8',
    description: '主题相关，但无明确因果或证据关系。',
  },
  derived: {
    label: '派生',
    color: '#8b5cf6',
    description: '目标节点由源节点推理派生。',
  },
};

export function getRelationLabel(relation: RelationType | string): string {
  return RELATION_DEFINITIONS[relation as RelationType]?.label ?? relation;
}

export function getRelationColor(relation: RelationType | string): string {
  return RELATION_DEFINITIONS[relation as RelationType]?.color ?? '#94a3b8';
}

/**
 * 基于简单启发式判断两个节点之间的潜在关系类型。
 * 可用于客户端快速预览；精确判断应调用 LLM 或证据审查模块。
 */
export function heuristicRelationJudgment(a: GraphNode, b: GraphNode): RelationJudgment | null {
  const aText = `${a.label || ''} ${a.description || ''} ${(a.metadata?.tags || []).join(' ')}`.toLowerCase();
  const bText = `${b.label || ''} ${b.description || ''} ${(b.metadata?.tags || []).join(' ')}`.toLowerCase();

  const aWords = new Set(aText.split(/\W+/).filter((w) => w.length > 2));
  const bWords = new Set(bText.split(/\W+/).filter((w) => w.length > 2));
  const shared = Array.from(bWords).filter((w) => aWords.has(w));
  const overlap = shared.length / Math.max(aWords.size, bWords.size);

  if (overlap < 0.1) return null;

  const contradictionWords = ['反对', '反驳', '矛盾', '否', '不', 'contradict', 'refute', 'oppose', 'dispute'];
  const aRefutes = contradictionWords.some((w) => aText.includes(w));
  const bRefutes = contradictionWords.some((w) => bText.includes(w));

  let relation: RelationType = 'related';
  let confidence = overlap;

  if (aRefutes || bRefutes) {
    relation = 'refutes';
    confidence = Math.min(1, confidence + 0.25);
  } else if (a.type === 'paper' && (b.type === 'principle' || b.type === 'concept')) {
    relation = 'supports';
    confidence = Math.min(1, confidence + 0.15);
  } else if (a.type === 'principle' && b.type === 'concept') {
    relation = 'derived';
  }

  return {
    sourceId: a.id,
    targetId: b.id,
    relation,
    confidence: Math.round(confidence * 100) / 100,
    evidence: `共享关键词：${shared.slice(0, 6).join('、')}`,
  };
}

/**
 * 为一批节点生成候选关系列表。
 */
export function generateCandidateRelations(nodes: GraphNode[]): RelationJudgment[] {
  const candidates: RelationJudgment[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const ab = heuristicRelationJudgment(a, b);
      if (ab && ab.confidence >= 0.35) candidates.push(ab);
      const ba = heuristicRelationJudgment(b, a);
      if (ba && ba.confidence >= 0.35) candidates.push(ba);
    }
  }
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/**
 * 将候选关系转换为 GraphLink。
 */
export function relationJudgmentsToLinks(judgments: RelationJudgment[]): GraphLink[] {
  return judgments.map((j) => ({
    id: `ai-${j.sourceId}-${j.targetId}-${j.relation}`,
    source: j.sourceId,
    target: j.targetId,
    label: getRelationLabel(j.relation),
    color: getRelationColor(j.relation),
    type: j.relation,
    confidence: j.confidence,
  }));
}

export interface TaskDependencySuggestion {
  sourceId: string;
  targetId: string;
  confidence: number;
  reason: string;
}

/**
 * 基于任务文本内容和时间顺序，推测任务之间的潜在依赖关系。
 * 可用于 2D 执行图的"自动连线"功能。
 */
export function suggestTaskDependencies(tasks: ExecutionTask[]): TaskDependencySuggestion[] {
  if (tasks.length < 2) return [];

  const suggestions: TaskDependencySuggestion[] = [];
  const taskTexts = new Map(
    tasks.map((t) => [
      t.id,
      `${t.title || ''} ${t.description || ''} ${(t.deliverables || []).join(' ')}`.toLowerCase(),
    ])
  );

  for (let i = 0; i < tasks.length; i++) {
    for (let j = 0; j < tasks.length; j++) {
      if (i === j) continue;
      const source = tasks[i];
      const target = tasks[j];

      // Already depends on
      if (target.dependsOn?.includes(source.id)) continue;

      const sourceText = taskTexts.get(source.id) || '';
      const targetText = taskTexts.get(target.id) || '';

      const sourceWords = new Set(sourceText.split(/\W+/).filter((w) => w.length > 2));
      const targetWords = new Set(targetText.split(/\W+/).filter((w) => w.length > 2));
      const shared = Array.from(targetWords).filter((w) => sourceWords.has(w));
      const overlap = shared.length / Math.max(sourceWords.size, targetWords.size);

      if (overlap < 0.15) continue;

      // Time-based penalty: later tasks are less likely to depend on earlier ones
      const sourceStart = new Date(source.startDate).getTime();
      const targetStart = new Date(target.startDate).getTime();
      const timeBonus = targetStart > sourceStart ? 0.15 : -0.1;

      const confidence = Math.min(0.95, overlap + timeBonus);
      if (confidence < 0.35) continue;

      suggestions.push({
        sourceId: source.id,
        targetId: target.id,
        confidence: Math.round(confidence * 100) / 100,
        reason: `共享关键词：${shared.slice(0, 5).join('、')}`,
      });
    }
  }

  // Keep only the strongest suggestion per target to avoid clutter
  const bestByTarget = new Map<string, TaskDependencySuggestion>();
  for (const s of suggestions) {
    const existing = bestByTarget.get(s.targetId);
    if (!existing || s.confidence > existing.confidence) {
      bestByTarget.set(s.targetId, s);
    }
  }

  return Array.from(bestByTarget.values()).sort((a, b) => b.confidence - a.confidence);
}
