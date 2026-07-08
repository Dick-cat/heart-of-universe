# 宇宙之心 v1.3 模块清晰度与冗余审查

> 基于当前代码现状（v1.3 UI 重构后）进行的功能冗余与模块边界审查。

---

## 1. 总体判断

v1.3 的 UI 重构方向清晰：
- **右上角** = AI/学术/视觉/证据四类工具入口
- **底部控制台** = 项目驾驶舱（时序 + 逻辑树 + Agent）
- **浮动便签** = 多节点详情
- **左侧边栏** = 项目/视图/导航

但仍存在 **4 个未解决冲突** 和 **2 个冗余文件**。

---

## 2. 冗余与待清理

### 2.1 `components/AttentionDashboard.tsx` —— 已弃用

- **问题**：v1.2 第二轮迭代已将注意力仪表盘移入 `TrainingGate`，但 `AttentionDashboard.tsx` 文件仍保留在代码库中，未被引用。
- **风险**：造成维护负担，未来可能误修改。
- **建议**：删除该文件，或在 v1.4 改造为"历史注意力报告"面板。

### 2.2 `components/AcademicSearchPanel.tsx` —— 已弃用

- **问题**：v1.3 已将学术搜索提取为 `AcademicSearchPanelInner.tsx`，并被 `AcademicToolsPanel.tsx` 使用。旧的 `AcademicSearchPanel.tsx` 不再被引用。
- **风险**：代码重复，容易混淆。
- **建议**：删除该文件。

### 2.3 `AgentClusterPanel` —— 位置与职责冲突

- **问题**：`AgentClusterPanel` 仍作为浮动面板出现在右下角，与底部控制台中的 "Agent 架构" Tab 职责重叠。
- **风险**：两个 Agent 入口，用户不知道用哪个。
- **建议**：将 `AgentClusterPanel` 的功能整合进 `BottomConsole` 的 Agent Tab，移除浮动面板。

### 2.4 `ChangeLogPanel` —— 位置突兀

- **问题**：更新日志仍作为右下角浮动面板存在，与项目驾驶舱/工具矩阵风格不一致。
- **风险**：占用宝贵的右下角/右上角空间。
- **建议**：移入左侧边栏底部或底部控制台的 "信息" Tab。

---

## 3. 模块边界不清晰

### 3.1 `NodeDetail` 的容器假设

- **问题**：`NodeDetail` 最初为固定右栏设计，内部使用 `aside className="... w-[420px] ... border-l ..."`。现在它被嵌入可缩放/移动的 `StickyNote` 中，固定宽度和边框样式显得生硬。
- **建议**：为 `NodeDetail` 增加 `variant` prop 或容器化重构：
  - `variant="sidebar"`：保持原来的右栏样式
  - `variant="sticky"`：去掉固定宽度和边框，适应便签容器

### 3.2 `selectedNodeId` 与便签的语义冲突

- **问题**：点击节点会同时 `setSelectedNodeId(id)` 和 `openStickyNote(id)`。但右上角工具（如证据仪表、学术工具）依赖 `selectedNodeId`，而用户可能正在查看某个便签中的节点。
- **风险**：用户以为在审查便签 A，实际上工具审查的是 selectedNodeId B。
- **建议**：
  - 方案 A：点击节点只打开便签，不自动设置 `selectedNodeId`；工具栏的"当前选中节点"取最后聚焦的便签。
  - 方案 B：便签获得焦点时更新 `selectedNodeId`。
  - **推荐方案 B**，因为它改动最小且语义一致。

### 3.3 证据审查 vs 学术审查

- **问题**：`EvidenceReviewDashboard` 是通用证据审查，但用户要求"学术工具"包含学术审查。目前 `AcademicToolsPanel` 的"学术审查" Tab 只是占位文字。
- **建议**：
  - 将 `EvidenceReviewDashboard` 改名为更通用的 `ReviewDashboard`。
  - 在 `AcademicToolsPanel` 的学术审查 Tab 中，对选中节点直接调用 `runAIEvidenceReview` 并预设学术维度权重（来源、方法论优先）。
  - 或：将审查入口统一放在右上角"证据仪表"，学术审查只是其一个子模式。

---

## 4. 右上角按钮顺序与重叠风险

当前按钮位置（从顶部开始）：

| 位置 | 面板 | 问题 |
|---|---|---|
| `top-16` | 学术工具 | OK |
| `top-28` | AI 助手 | OK |
| `top-44` | 证据仪表 | OK |
| `top-60` | 视觉监督 | OK |

**问题**：
1. 按钮之间的垂直间距不一致（16/28/44/60 不是等差）。
2. 当多个面板同时打开时，面板可能互相遮挡。
3. 没有视觉分组，用户难以快速识别工具类型。

**建议**：
- 统一间距：`top-16`、`top-28`、`top-40`、`top-52`（每格 12px）。
- 或者使用一个统一的 `TopRightToolbar` 容器，内部用 flex 排列按钮，打开的面板在下方统一区域层叠显示。
- 给不同工具添加颜色标识条。

---

## 5. 底部控制台现状

`BottomConsole.tsx` 当前是**骨架**：
- 时序编辑器 Tab：占位文字
- 逻辑树输入 Tab：占位文字
- Agent 架构 Tab：占位文字

**建议下一步**：
1. 将 `AgentClusterPanel` 的调用逻辑迁入 Agent Tab。
2. 实现逻辑树输入的文本解析器（如 `目标 -> 子目标1 -> 子目标2`）。
3. 实现时序编辑器的节点时间线视图。

---

## 6. 推荐清理动作清单

- [ ] 删除 `components/AttentionDashboard.tsx`
- [ ] 删除 `components/AcademicSearchPanel.tsx`
- [ ] 将 `AgentClusterPanel` 从 `page.tsx` 浮动层移除，迁入 `BottomConsole` Agent Tab
- [ ] 将 `ChangeLogPanel` 从 `page.tsx` 浮动层移除，迁入 `LeftSidebar` 或 `BottomConsole`
- [ ] 重构 `NodeDetail` 支持 `variant="sticky"`
- [ ] 便签获得焦点时同步更新 `selectedNodeId`
- [ ] 统一右上角按钮间距或改为 `TopRightToolbar`
- [ ] 为 `AcademicToolsPanel` 的"学术审查" Tab 接入真实审查逻辑

---

## 7. 结论

v1.3 的架构方向正确，但存在 **4 个历史面板未归位** 和 **2 个废弃文件**。清理后，模块边界将非常清晰：

- 左栏：导航与项目
- 中上：3D 画布
- 右上：四类工具
- 底部：项目驾驶舱控制台
- 浮动：节点便签

清理工作量估计：0.5–1 天。

---

*审查时间：2026-06-20*
