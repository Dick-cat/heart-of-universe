# 认知训练监督算法设计文档

> 目标：在没有大厂级用户数据的前提下，设计一套可解释、可本地运行的认知状态估计与训练干预算法。

---

## 1. 设计前提：我们没有什么
这个项目只是作为业余工具，不追求大规模用户数据。

| 大厂条件 | 本项目现状 |
|---|---|
| 千万级用户行为日志 | 小型本地使用 |
| 专业标注团队 | 无，依赖用户自我报告或轻量反馈 |
| 云端算力与存储 | 本地 PC / 笔记本 |
| 眼动仪、可穿戴设备 | 仅键盘、鼠标、屏幕交互 |
| 长期 A/B 测试平台 | 离线实验 + 用户主观反馈 |

**结论**：目前不能走“大数据训练黑箱模型”路线，必须采用**规则+轻量模型+用户校准**的混合策略。

---

## 2. 核心设计原则

### 2.1 理论驱动，而非数据驱动

- 基于认知心理学、人机交互（HCI）、阅读理解的公开研究成果设计指标。
- 例如：
  - **认知负荷理论**（Cognitive Load Theory）：过长文本应分段。
  - **工作记忆容量**（7±2 组块）：限制单次呈现节点数量。
  - **主动回忆**（Active Recall）：输出摘要比重复阅读更有效。
  - **注意力衰减曲线**：阅读 15–20 分钟后效率下降。

### 2.2 本地优先，隐私最小化

- 所有行为数据优先本地存储（IndexedDB / SQLite）。
- 不上传原始行为序列，仅可选上传脱敏后的聚合统计。
- 不涉及指纹、键盘生物特征等敏感识别信息。

### 2.3 可解释、可配置

- 每个干预决策必须能向用户说明原因。
- 用户可调整训练强度、关闭某些监督维度。
- 避免黑箱“系统觉得你没认真”带来的挫败感。

### 2.4 渐进式个性化

- 不追求一次性训练出完美模型。
- 通过用户少量校准样本（如 5–10 次自我报告）调整阈值。
- 使用在线更新：随着使用，阈值缓慢漂移适应个人习惯。

### 2.5 容错与人性化

- 对疾病用户（如ADHD）设置高容忍度，避免惩罚性反馈。
- 允许“跳过”或“降低强度”，但记录用户主动选择。

---

## 3. 可采集的低敏感行为信号

仅使用普通桌面交互即可获得的数据：

| 信号 | 采集方式 | 隐私等级 | 说明 |
|---|---|---|---|
| 鼠标点击 | 事件监听 | 低 | 新建节点、编辑、滚动触发 |
| 键盘输入 | 事件监听 | 低 | 打字速度、停顿、删除率 |
| 滚动事件 | 事件监听 | 低 | 阅读位置、滚动速度 |
| 页面停留时长 | 时间戳 | 低 | 节点详情页、AI 输出面板 |
| 节点操作序列 | 应用状态 | 低 | 增删改查节点与关系 |
| 自写摘要 | 用户输入 | 低 | 文本内容（本地） |
| 自评反馈 | 显式按钮 | 低 | “这太难/太简单/刚好” |
| 语音输入（可选） | Web Speech API | 中 | 语速、停顿（不存储原始音频） |

**不采集（后续跟进）**：
- 摄像头、麦克风持续监控
- 眼动轨迹（无硬件）
- 后台进程、浏览器历史
- 精确到个人身份的击键动力学

---

## 4. 认知状态指标设计

基于上述信号，设计一组**可解释、可计算**的指标。

### 4.1 注意力指标（Attention Score）

#### 4.1.1 阅读覆盖度（Coverage）

```
coverage = (用户滚动浏览过的内容高度) / (AI 输出总高度)
```

- 低于 0.3：可能未阅读。
- 0.3–0.8：部分阅读。
- 大于 0.8：完整阅读。

#### 4.1.2 阅读停留时间（Dwell Time）

```
dwell = AI 输出面板打开且窗口聚焦的累计时间
```

- 结合文本长度计算“平均阅读速度”参考值。
- 成年人中文阅读速度约 300–500 字/分钟。

#### 4.1.3 交互密度（Interaction Density）

```
density = (点击次数 + 滚动次数 + 选中文本次数) / 阅读时长
```

- 过低：可能挂机或心不在焉。
- 过高：可能焦虑或反复查找。

### 4.2 主动思考指标（Engagement Score）

#### 4.2.1 自写摘要质量（Summary Quality）

使用轻量本地规则打分：

| 维度 | 计算方法 | 权重 |
|---|---|---|
| 长度 | 字数 ≥ 30 字 | 0.2 |
| 关键词覆盖 | 摘要中覆盖 AI 输出关键词比例 | 0.3 |
| 原创性 | 与原文直接重复片段占比低 | 0.2 |
| 结构化 | 包含节点/关系/结论等结构信号 | 0.3 |

> 关键词覆盖可使用简单 TF-IDF 或本地小模型 embedding。

#### 4.2.2 手动节点创建率（Manual Node Ratio）

```
ratio = 用户手动创建的节点数 / AI 生成的节点数
```

- 目标：> 0.2（每 5 个 AI 节点至少有 1 个用户自建）。

#### 4.2.3 追问与编辑行为

- 是否对 AI 输出提出追问。
- 是否修改 AI 生成的节点标签/描述/关系。
- 是否添加批注或摘录。

### 4.3 认知负荷指标（Cognitive Load）

#### 4.3.1 输入流畅度（Fluency）

```
fluency = 有效输入字数 / 输入总时长
pause_ratio = 长停顿次数（>3秒）/ 总输入段数
```

- 输入极慢 + 大量停顿：可能认知负荷过高。
- 输入极快 + 高复制率：可能未思考。

#### 4.3.2 错误/撤销率

```
error_rate = (删除字符数 + 撤销次数) / 总输入字符数
```

- 高错误率可能表示疲劳或困难。

#### 4.3.3 任务完成时间

- 过长：可能需要简化或辅助。
- 过短：可能需要提高要求。

#### 4.3.4 挂机时间

```
idle_time = 交互密度 < 0.05 且 阅读停留时间 > 60s 的累计时间
```

- 过长：可能挂机或心不在焉。

加入挂机功能，用户停止操作超过N秒则右下角弹出温和提醒，不惩罚。
---

## 5. 算法架构：规则引擎 + 轻量 ML

### 5.1 整体架构

```
行为信号采集层
    ↓
特征计算层（实时）
    ↓
规则引擎层（可解释决策）
    ↓
可选：轻量本地模型层（个性化校准）
    ↓
干预策略层（提示、分段、强制闭环）
    ↓
用户反馈层（自我报告 → 调整阈值）
```

### 5.2 规则引擎（核心）

规则引擎是主力，不依赖大数据。

示例规则：

```yaml
rules:
  - name: 强制阅读时间
    condition: dwell_time < max(30s, text_length / reading_speed)
    action: 禁用"应用"按钮，提示"请继续阅读"

  - name: 摘要检查
    condition: summary_quality < 0.5
    action: 要求补充摘要，给出示例

  - name: 手动节点鼓励
    condition: manual_node_ratio < 0.2 AND ai_nodes > 3
    action: 提示"尝试用一句话创建一个你自己的节点"

  - name: 认知负荷过高
    condition: fluency < threshold AND pause_ratio > 0.5
    action: 简化本次输出，分段展示

  - name: 挂机检测
    condition: interaction_density < 0.05 AND dwell_time > 60s
    action: 弹出温和提醒，不惩罚
```

### 5.3 轻量本地模型（可选增强）

#### 5.3.1 使用场景

- 摘要质量评分（比规则更准确）。
- 个性化阈值调整。
- 简单的时间序列异常检测（检测用户状态变化）。

#### 5.3.2 可选方案

| 方案 | 优点 | 缺点 | 建议 |
|---|---|---|---|
| 规则 + TF-IDF | 零依赖、可解释 | 精度有限 | 首选 |
| 本地 Embedding（如 transformers.js） | 语义理解好 | 首次加载大、慢 | 摘要质量评估可用 |
| 朴素贝叶斯 / 逻辑回归 | 可在线学习 | 需要标注数据 | 用户自我报告 10 条后可启用 |
| 小型 LSTM / 1D-CNN | 可建模时序 | 复杂、难解释 | 不建议 |

#### 5.3.3 个性化校准流程

```
第 1 周：仅采集基线，不干预
        ↓
用户完成 5–10 次自我报告（“这次难/易/刚好”）
        ↓
用这些样本拟合个人阈值（如阅读速度、摘要长度期望）
        ↓
后续使用个人阈值，每周微调
```

---

## 6. 注意力估计算法详细设计

### 6.1 输入

```typescript
interface InteractionSession {
  startTime: number;
  endTime: number;
  contentLength: number; // 字数
  scrollEvents: ScrollEvent[];
  clicks: ClickEvent[];
  keystrokes: KeystrokeEvent[];
  selections: SelectionEvent[];
  selfSummary: string;
  selfReport?: 'too_easy' | 'comfortable' | 'too_hard';
}
```

### 6.2 输出

```typescript
interface AttentionEstimate {
  score: number; // 0–1
  flags: AttentionFlag[];
  explanation: string; // 中文解释
}

type AttentionFlag =
  | 'insufficient_reading_time'
  | 'low_scroll_coverage'
  | 'low_interaction'
  | 'high_pause_ratio'
  | 'summary_too_short'
  | 'summary_too_similar_to_source'
  | 'no_manual_node';
```

### 6.3 计算流程

```typescript
function estimateAttention(session: InteractionSession): AttentionEstimate {
  const flags: AttentionFlag[] = [];

  // 1. 阅读时间是否充足
  const expectedTime = Math.max(30, session.contentLength / 5); // 约 300 字/分钟
  if (session.endTime - session.startTime < expectedTime * 1000) {
    flags.push('insufficient_reading_time');
  }

  // 2. 滚动覆盖度
  const coverage = computeScrollCoverage(session.scrollEvents, session.contentLength);
  if (coverage < 0.5) flags.push('low_scroll_coverage');

  // 3. 交互密度
  const interactionCount = session.clicks.length + session.scrollEvents.length + session.selections.length;
  const durationMin = (session.endTime - session.startTime) / 60000;
  const density = durationMin > 0 ? interactionCount / durationMin : 0;
  if (density < 2) flags.push('low_interaction');

  // 4. 摘要质量
  const summaryScore = evaluateSummary(session.selfSummary, /* source text */);
  if (summaryScore.lengthScore < 0.5) flags.push('summary_too_short');
  if (summaryScore.similarityScore > 0.8) flags.push('summary_too_similar_to_source');

  // 5. 综合得分
  const flagPenalty = 1 / (1 + flags.length * 0.3);
  const score = clamp(summaryScore.total * 0.4 + coverage * 0.3 + Math.min(density / 10, 1) * 0.2 + flagPenalty * 0.1, 0, 1);

  return {
    score,
    flags,
    explanation: generateExplanation(flags, score),
  };
}
```

### 6.4 摘要质量评估（本地规则版）

```typescript
function evaluateSummary(summary: string, source: string): SummaryScore {
  const summaryWords = segmentWords(summary);
  const sourceWords = segmentWords(source);

  // 长度分
  const lengthScore = Math.min(summaryWords.length / 30, 1);

  // 关键词覆盖：用 source 中高频词在 summary 中的出现比例
  const sourceKeywords = extractKeywords(sourceWords, 10);
  const covered = sourceKeywords.filter((w) => summaryWords.includes(w)).length;
  const keywordScore = covered / sourceKeywords.length;

  // 原创性：直接连续 6 字重复比例
  const similarityScore = computeLongestCommonSubstringRatio(summary, source);

  // 结构化：是否包含常见连接词/结论词
  const structureScore = hasStructureSignals(summary) ? 1 : 0.5;

  return {
    lengthScore,
    keywordScore,
    similarityScore,
    structureScore,
    total: lengthScore * 0.2 + keywordScore * 0.3 + (1 - similarityScore) * 0.2 + structureScore * 0.3,
  };
}
```

---

## 7. 干预策略算法

### 7.1 干预强度模型

根据用户画像和当前状态，选择干预强度：

```typescript
interface InterventionPolicy {
  level: 'none' | 'light' | 'medium' | 'strong';
  minReadSeconds: number;
  requireSummary: boolean;
  requireManualNode: boolean;
  allowSkip: boolean;
  segmentContent: boolean;
}

function selectPolicy(userProfile: UserProfile, attentionScore: number): InterventionPolicy {
  if (userProfile.condition === 'als' || userProfile.condition === 'cognitive_decline') {
    return { level: 'medium', minReadSeconds: 45, requireSummary: true, requireManualNode: false, allowSkip: true, segmentContent: true };
  }
  if (attentionScore < 0.3) return { level: 'strong', ... };
  if (attentionScore < 0.6) return { level: 'medium', ... };
  return { level: 'light', minReadSeconds: 15, requireSummary: false, requireManualNode: false, allowSkip: true, segmentContent: false };
}
```

### 7.2 自适应调整

根据用户反馈调整阈值：

```typescript
function updateThreshold(current: number, feedback: 'too_easy' | 'comfortable' | 'too_hard', learningRate = 0.05): number {
  if (feedback === 'too_easy') return current * (1 + learningRate);
  if (feedback === 'too_hard') return current * (1 - learningRate);
  return current;
}
```

---

## 8. 没有大数据，如何验证算法有效性

### 8.1 主观验证
需要设计一套打分表，给出1-10的评分：
- 每次训练闭环后询问用户，例如：
  - “这次难度是否合适？”
  - “你觉得自己真正理解了吗？”
  - “哪个步骤最累？”
- 收集 NPS/满意度评分。
- 明确告知用户舒适度，并且记录用户主动选择。

### 8.2 行为指标趋势

- 长期追踪：
  - 自写摘要长度是否增加。
  - 手动节点比例是否提升。
  - AI 输出后直接应用率是否下降（说明用户开始思考）。
  - 节点关系密度是否增加（说明知识网络化）。

### 8.3 对照实验

- 同一用户在不同话题下开启/关闭训练模式，对比知识保留率。
- 使用小测验，不借助ai复刻网络，测试用户理解程度。

### 8.4 专家评审

- 邀请专业人员绘制、评审知识网络，防止认知偏差。
- 邀请教育工作者、心理医生、HCI 研究者审阅干预逻辑。
- 避免算法设计中的认知偏见。

---

## 9. 隐私与数据流设计

### 9.1 数据分层

| 数据类型 | 存储位置 | 是否可上传 |
|---|---|---|
| 原始行为事件序列 | 本地 IndexedDB | 否 |
| 聚合统计（日均交互次数） | 本地 | 可选（默认关闭） |
| 自写摘要 | 本地 | 否 |
| 用户画像与阈值 | 本地 | 否 |
| 自我报告反馈 | 本地 | 可选（用于改进） |

### 9.2 上传数据示例

```json
{
  "sessionIdHash": "sha256-anonymous",
  "durationSeconds": 120,
  "attentionScore": 0.72,
  "flagsCount": 1,
  "selfReport": "comfortable",
  "timestamp": "2026-06-16T15:00:00Z"
}
```


---

## 10. 实现优先级

### 10.1 第一阶段：规则引擎 MVP（1–2 周）

- 实现阅读计时、滚动覆盖度、交互密度。
- 强制摘要 + 强制手动节点（按策略配置）。
- 简单摘要长度与原创性评分。
- 训练模式开关与统计面板。

### 10.2 第二阶段：个性化校准（2–3 周）

- 采集 1 周易用基线。
- 引入自我报告反馈。
- 根据个人数据调整阅读速度、摘要长度期望。

### 10.3 第三阶段：轻量模型增强（4–6 周）

- 引入本地 embedding 评估摘要语义质量。
- 简单时间序列异常检测。
- 可选：transformers.js 本地摘要相似度模型。

### 10.4 第四阶段：多人群策略包（长期）

- ADHD患者模板、学生学习模板、知识工作者模板。
- 机构管理后台。

---

## 11. 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| 算法误判用户挂机 | 允许用户申诉/跳过，不惩罚 |
| 疾病用户感到挫败 | 高容错、大按钮、语音辅助、允许降低强度 |
| 隐私泄露 | 本地优先、默认不上传、最小化采集 |
| 算法偏见 | 多专家评审、用户可配置、避免标签化 |
| 训练效果无法验证 | 主观反馈 + 行为趋势 + 小测验对照 |

---

## 12. 与大厂路径的差异总结

| 维度 | 大厂路径 | 本项目路径 |
|---|---|---|
| 数据 | 海量用户日志 | 小样本 + 理论 |
| 模型 | 深度神经网络黑箱 | 规则引擎 + 可选轻量模型 |
| 运行位置 | 云端 | 本地优先 |
| 个性化 | 自动推断 | 用户自我报告 + 可配置策略 |
| 可解释性 | 低 | 高 |
| 隐私 | 集中收集 | 最小化、本地 |
| 精度 | 高（对群体） | 中等（对个人，但够用） |

---

*文档版本：v1.0 算法设计审阅版*
*最后更新：2026-06-16*
