import { CognitiveTrainingConfig } from './types';

export interface TrainingGateState {
  startedAt: number;
  elapsedSeconds: number;
  scrollCoverage: number;
  summary: string;
  manualNodeCreated: boolean;
}

export interface GateStatus {
  canApply: boolean;
  missing: string[];
  progress: number;
}

const AVG_READING_SPEED_CPM = 350; // 中文平均阅读速度：350 字/分钟

export function computeRequiredReadSeconds(contentLength: number, minReadSeconds: number): number {
  const estimated = Math.ceil((contentLength / AVG_READING_SPEED_CPM) * 60);
  return Math.max(minReadSeconds, estimated);
}

export function evaluateGate(
  config: CognitiveTrainingConfig,
  state: TrainingGateState,
  contentLength: number
): GateStatus {
  const requiredSeconds = computeRequiredReadSeconds(contentLength, config.minReadSeconds);
  const missing: string[] = [];

  if (state.elapsedSeconds < requiredSeconds) {
    missing.push(`还需阅读约 ${requiredSeconds - state.elapsedSeconds} 秒`);
  }

  if (state.scrollCoverage < 0.5) {
    missing.push('请滚动浏览更多内容');
  }

  if (config.requireSelfSummary && state.summary.trim().length < 10) {
    missing.push('请用一句话写下你的理解');
  }

  if (config.requireManualNode && !state.manualNodeCreated) {
    missing.push('请手动创建一个节点');
  }

  const checks = [
    state.elapsedSeconds >= requiredSeconds,
    state.scrollCoverage >= 0.5,
    !config.requireSelfSummary || state.summary.trim().length >= 10,
    !config.requireManualNode || state.manualNodeCreated,
  ];
  const progress = checks.filter(Boolean).length / checks.length;

  return {
    canApply: missing.length === 0,
    missing,
    progress,
  };
}

export function computeScrollCoverage(
  container: HTMLElement | null,
  scrollTop: number,
  clientHeight: number
): number {
  if (!container) return 0;
  const scrollHeight = container.scrollHeight;
  if (scrollHeight <= clientHeight) return 1;
  const visibleBottom = scrollTop + clientHeight;
  return Math.min(1, visibleBottom / scrollHeight);
}

export function summaryQuality(summary: string): { score: number; feedback: string } {
  const len = summary.trim().length;
  if (len < 10) return { score: 0, feedback: '摘要太短，请至少写一句话。' };
  if (len < 30) return { score: 0.5, feedback: '可以尝试写得更具体一些。' };

  // 简单结构信号：包含"因为/所以/关键/核心/首先/其次/结论"等
  const structureSignals = /(因为|所以|关键|核心|首先|其次|最后|结论|总结|换言之)/;
  const hasStructure = structureSignals.test(summary);

  return {
    score: hasStructure ? 1 : 0.7,
    feedback: hasStructure ? '结构清晰，很好。' : '可以尝试加入连接词，让逻辑更清楚。',
  };
}
