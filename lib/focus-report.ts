import { GraphNode, FocusSession, TrainingSession } from './types';

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const s = sec % 60;
  if (h > 0) return `${h}小时 ${m % 60}分 ${s}秒`;
  return `${m}分 ${s}秒`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN');
}

export interface FocusReportData {
  focusSessions: FocusSession[];
  trainingSession: TrainingSession;
  nodes: GraphNode[];
}

export function generateFocusReport(data: FocusReportData): string {
  const { focusSessions, trainingSession, nodes } = data;

  const totalEffectiveMs = focusSessions.reduce((sum, s) => sum + s.effectiveMs, 0);
  const avgFocusScore = focusSessions.length
    ? focusSessions.reduce((sum, s) => sum + s.visualFocusScore, 0) / focusSessions.length
    : 0;
  const avgFatigueScore = focusSessions.length
    ? focusSessions.reduce((sum, s) => s.fatigueScore, 0) / focusSessions.length
    : 0;
  const totalFaceLostMs = focusSessions.reduce((sum, s) => s.faceLostMs, 0);
  const totalLookingAwayMs = focusSessions.reduce((sum, s) => s.lookingAwayMs, 0);

  const aiNodes = nodes.filter((n) => n.aiGrade);
  const gradeCount: Record<string, number> = { Ⅰ: 0, Ⅱ: 0, Ⅲ: 0 };
  for (const n of aiNodes) {
    if (n.aiGrade) gradeCount[n.aiGrade] = (gradeCount[n.aiGrade] || 0) + 1;
  }

  const lines: string[] = [
    '# 专注力与学习报告',
    '',
    `生成时间：${formatDate(Date.now())}`,
    '',
    '## 视觉专注统计',
    '',
    `- 专注次数：${focusSessions.length}`,
    `- 总有效学习时长：${formatMs(totalEffectiveMs)}`,
    `- 平均专注得分：${Math.round(avgFocusScore * 100)} / 100`,
    `- 平均疲劳指数：${Math.round(avgFatigueScore * 100)} / 100`,
    `- 人脸丢失累计：${formatMs(totalFaceLostMs)}`,
    `- 视线偏离累计：${formatMs(totalLookingAwayMs)}`,
    '',
  ];

  if (focusSessions.length > 0) {
    lines.push('### 每次专注记录', '');
    focusSessions.forEach((s, idx) => {
      lines.push(
        `${idx + 1}. ${formatDate(s.startedAt)} — ${formatDate(s.endedAt)}`,
        `   - 有效时长：${formatMs(s.effectiveMs)}`,
        `   - 专注得分：${Math.round(s.visualFocusScore * 100)}`,
        `   - 疲劳指数：${Math.round(s.fatigueScore * 100)}`
      );
    });
    lines.push('');
  }

  lines.push(
    '## 认知训练统计',
    '',
    `- AI 交互次数：${trainingSession.totalAiInteractions}`,
    `- 自主摘要次数：${trainingSession.selfSummaries}`,
    `- 手动创建节点数：${trainingSession.manualNodes}`,
    '',
    '## AI 生成节点分级',
    '',
    `- 直接生成（Ⅰ）：${gradeCount['Ⅰ']} 个`,
    `- 已审查（Ⅱ）：${gradeCount['Ⅱ']} 个`,
    `- 严格审查并修改（Ⅲ）：${gradeCount['Ⅲ']} 个`,
    '',
    '### 节点明细',
    ''
  );

  if (aiNodes.length === 0) {
    lines.push('暂无 AI 生成节点。', '');
  } else {
    aiNodes.forEach((n) => {
      lines.push(`- [${n.aiGrade}] ${n.label}`);
    });
    lines.push('');
  }

  lines.push(
    '## 说明',
    '',
    '- Ⅰ：AI 直接生成',
    '- Ⅱ：已审查（通过认知训练摘要）',
    '- Ⅲ：严格审查并修改（通过认知训练摘要并手动创建节点）',
    ''
  );

  return lines.join('\n');
}

export function exportFocusReport(data: FocusReportData, filename?: string) {
  const report = generateFocusReport(data);
  const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `专注与学习报告-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
