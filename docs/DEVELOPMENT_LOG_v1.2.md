# 宇宙之心 v1.2 开发日志与范围定义

> 策略调整：在启动后端、账号、商业化之前，先把 v1.x 的本地优先体验打磨到极致。v1.2 是 v1.x 的终极本地版。

---

## 1. 版本目标

在 v1.1 基础上，补齐以下能力：

1. **真正的注意力监督**：通过点击、滚动、焦点、空闲、摄像头（可选）等多维信号评估用户注意力。
2. **完整的认知训练闭环**：AI 输出后必须经过强制阅读、自写摘要、手动建节点才能应用。
3. **本地学术模式**：直接接入 OpenAlex / arXiv 公开 API，搜索论文并导入为节点。
4. **超能模式 Lite**：对节点/附件来源做基础可信度审查与徽章标记。
5. **附件/PDF 体验升级**：PDF 真正持久化存储，支持内置阅读。
6. **大量 UX 打磨**：快捷键、自动保存、性能优化、新手引导。

**明确不做**：后端服务、账号体系、云同步、支付、实时协作（这些留给 v2.0）。

---

## 2. 开发阶段

### Phase 1：注意力与认知训练（第 1–2 周）

- [x] 行为追踪引擎（鼠标、滚动、焦点、空闲）
- [x] 注意力评分与分心检测
- [x] 注意力仪表盘
- [x] 认知训练闭环真正生效
- [x] 可选摄像头视觉监督

### Phase 2：学术模式与附件（第 3–4 周）

- [x] OpenAlex / arXiv 搜索面板
- [x] 论文导入为节点
- [x] PDF Blob 持久化与内置阅读器
- [ ] 内容条目支持 PDF 高亮/摘录（延期）

### Phase 3：超能模式 Lite 与 UX（第 5–6 周）

- [x] 来源可信度 heuristics
- [x] 节点严谨度判定与历史比较
- [x] 可信度徽章
- [x] 快捷键、自动保存
- [ ] 性能优化（大规模图谱，延期实测）
- [ ] 新手引导（延期）

### Phase 4：验证与打包（第 7 周）

- [x] `npm run build` 通过
- [x] `npm run electron:pack:win` 打包
- [ ] 关键路径手动测试

### 打包结果

- 产物：`dist/宇宙之心 Setup 1.2.0.exe`
- 大小：约 92 MB
- 版本：`package.json` 已更新为 `1.2.0`

---

## 3. 成功标准

- [x] 认知训练模式下，用户无法绕过阅读、摘要、手动节点直接应用 AI 输出。
- [x] 注意力仪表盘能实时显示当前会话的注意力得分与 flags。
- [x] OpenAlex/arXiv 搜索可在 3 秒内返回结果并导入节点。
- [x] PDF 附件刷新后仍可打开。
- [ ] 2000 节点下图谱仍流畅（待大规模数据实测）。

---

## 4. 主要新增/修改文件

| 文件 | 说明 |
|---|---|
| `lib/attention.ts` | 注意力追踪引擎与评分算法 |
| `hooks/useAttentionTracker.ts` | 注意力追踪 React Hook |
| `components/AttentionDashboard.tsx` | 注意力仪表盘 UI |
| `components/TrainingGate.tsx` | 集成注意力追踪与视觉监督分数 |
| `lib/visual-supervision.ts` | MediaPipe Face Mesh 视觉监督 |
| `hooks/useVisualSupervisor.ts` | 视觉监督单例 Hook |
| `components/VisualSupervisionPanel.tsx` | 摄像头监督面板 |
| `lib/academic-search.ts` | OpenAlex / arXiv 学术搜索 |
| `components/AcademicSearchPanel.tsx` | 学术搜索面板 |
| `lib/db.ts` | 新增 blobs 与 attentionSessions 表 |
| `lib/types.ts` | 新增 AttentionSessionRecord |
| `components/AttachmentUploader.tsx` | 支持 PDF 持久化到 IndexedDB |
| `components/AttachmentItem.tsx` | 附件渲染与 PDF 内嵌预览 |
| `hooks/useGraphStore.ts` | 删除节点/附件时清理 Blob |
| `lib/evidence-review.ts` | 证据审查与节点严谨度评估 |
| `components/EvidenceReviewDashboard.tsx` | 证据审查仪表板（含 AI 深度审查） |
| `lib/ai-evidence-review.ts` | AI 深度证据审查 |
| `docs/EVIDENCE_REVIEW_FOUNDATION.md` | 证据审查元方法学基石 |
| `hooks/useAutoSave.ts` | 自动保存 |
| `hooks/useKeyboardShortcuts.ts` | 快捷键（Ctrl+Z 撤销、Ctrl+S 保存、Esc 取消选择） |
| `electron/main.js` | 允许摄像头权限 |
| `app/page.tsx` | 版本号 v1.2，集成所有新面板 |

---

## 5. 第二次迭代：视觉监督与证据审查重构

### 5.1 视觉监督改进

- 修复了摄像头只能开启一次、关闭后无法重启的问题；现在 `stop()` 会完整清理资源，`start()` 会重新创建 FaceMesh / 媒体流。
- 新增**暂停/继续**、**最小化/显示面板**、**关闭摄像头**三种状态，不再只有关闭。
- 新增**视线校准流程**：用户跟随屏幕上的 9 个点点击校准，扩展有效视线范围。
- 新增**人脸网格线 + 视线向量可视化**：在视频画面上叠加 gaze 红点和状态指示灯。
- 新增**有效时间手动修正**：用户可 ±10 秒修正检测误差。
- 视线判断基于 MediaPipe Iris 瞳孔中心位置，结合校准数据映射到屏幕坐标。

### 5.2 证据审查改进

- 从简单的徽章面板升级为**证据审查仪表板**。
- 新增 **AI 深度审查**：调用 LLM 按五个维度（来源可信度、方法论、一致性、完整度、网络嵌入）输出结构化问题清单。
- 每个问题包含：位置、具体描述、改进建议、可执行验证步骤、严重程度。
- 建立 `docs/EVIDENCE_REVIEW_FOUNDATION.md` 元方法学基石，定义审查五维度与检查清单。

### 5.3 UI 调整

- 注意力仪表盘从独立浮动按钮移入**认知训练闭环（TrainingGate）**内部，实时显示当前会话注意力分与 flags。
- 视觉监督面板与证据审查仪表板移至**右侧**，与 AI、Agent 面板同侧。

---

## 6. 已知限制与下一步

1. **视线精度**：MediaPipe Iris 的屏幕 gaze 映射是近似估计，精度受光照、摄像头位置、头部移动影响；后续可考虑集成 WebGazer.js 或本地 Python gaze tracker（需打包 Python 运行时）。
2. **摄像头监督**：在 Electron 生产包中需实际测试摄像头权限与 MediaPipe CDN 加载稳定性；如 CDN 不稳定，需将模型文件打包到本地。
3. **学术搜索**：OpenAlex 摘要为倒排索引重建，可能存在语序问题；后续可接入官方摘要文本或 Semantic Scholar。
4. **PDF 高亮/摘录**：当前仅支持内嵌预览，未做段落级摘录。
5. **性能优化**：2000+ 节点的大规模图谱需实测后再做针对性优化（如虚拟化、层级加载）。
6. **新手引导**：v1.2 未实现，可在 v2.0 前补充。

---

*开始时间：2026-06-20*
*完成构建与打包：2026-06-20*
*第二次迭代完成：2026-06-20*
