# 宇宙之心 v1.1 开发日志

> 记录从 v1.0.0 到 v1.1.0 的核心架构改造与功能新增。

## 项目信息

- **仓库路径**: `C:/Users/1/ai-knowledge-graph`
- **技术栈**: Next.js 14 + React 18 + TypeScript + Electron + `react-force-graph-3d` + Zustand + Dexie
- **打包命令**: `npm run build && npm run electron:pack:win`
- **目标版本**: v1.1.0

---

## 2026-06-18 Phase 0：环境检查与基线

- 确认 `npm install` 与 `npm run build` 在原始 v1.0.0 代码上通过。
- 原始构建产物路径：`C:/Users/1/ai-knowledge-graph/.next`。
- 确认源码仓库（非安装包）位于 `C:/Users/1/ai-knowledge-graph`。

---

## 2026-06-18 Phase 1：类型系统与常量

### 改动文件

- `lib/types.ts`
- `lib/graph-utils.ts`
- `lib/llm.ts`

### 关键变更

1. **节点类型扩展与替换**
   - 移除：`video`、`image`
   - 新增：`communication`（通讯）、`ai-brief`（AI 短述）
2. **内容条目类型扩展**
   - 新增：`report`（报告）、`simulation`（推演）、`plan`（计划）、`evidence`（证据）
3. **连线模型增强**
   - `GraphLink` 新增 `color`（颜色）、`theme`（主题）、`variant: 'default' | 'cycle'`（循环标记）
4. **嵌套结构基础字段**
   - `GraphNode` 新增可选 `parentId?: string`，用于表达「节点属于另一节点的内部子网络」
5. **颜色映射更新**
   - `TYPE_COLOR_MAP` 中 `communication` 使用红色系，`ai-brief` 使用粉色系
6. **AI Prompt 同步**
   - `SYSTEM_PROMPT`、`SUMMARY_ASSISTANT_PROMPT` 中节点类型与内容类型枚举同步为新定义

---

## 2026-06-18 Phase 2：Store 状态与核心逻辑

### 改动文件

- `hooks/useGraphStore.ts`

### 关键变更

1. **新增全局状态**
   - `currentViewNodeId: string | null`：当前所处子网络视图的父节点 ID，`null` 表示根视图
   - `viewStack: string[]`：嵌套视图面包屑栈
   - `autoEnterOnZoom: boolean`：缩放到节点时是否自动进入子网络
2. **新增 Store 方法**
   - `enterNodeView(id)` / `exitNodeView()` / `goToRootView()`：嵌套视图导航
   - `moveNodeToParent(nodeId, parentId)`：把节点拖入另一节点成为子内容
   - `moveContentItemToNode(itemId, sourceNodeId, targetNodeId?)`：把节点内容条目拖出为新节点
   - `batchSetLinkColor`、`batchSetLinkTheme`、`markCycleLinks`：多选节点后批量设置连线颜色/主题/循环标记
   - `exportSubgraphByColor(color)` / `exportSubgraphByTheme(theme)`：按颜色或主题拆分子图并导出为 `Project`
3. **连线去重逻辑调整**
   - 由 `(source, target)` 二元组去重改为 `(source, target, color, theme, variant)` 五元组去重，实现「同一对节点间可存在多条不同颜色/主题的连线」
4. **删除节点级联**
   - `deleteNode` 与 `batchDeleteNodes` 会递归删除所有子节点，并同步清理 `currentViewNodeId` 与 `viewStack`
5. **持久化扩展**
   - `partialize` 新增 `currentViewNodeId` 与 `viewStack`
   - 导入/新建/撤销项目时统一重置视图栈

---

## 2026-06-18 Phase 3：图例与内容类型 UI

### 改动文件

- `components/LeftSidebar.tsx`
- `components/NodeDetail.tsx`

### 关键变更

1. **LeftSidebar 图例**
   - 移除「视频」「图片」
   - 新增「通讯」「AI 短述」
2. **LeftSidebar 手动添加节点类型下拉**
   - 同步为新节点类型列表
3. **LeftSidebar 新增「多视图」入口**
   - 点击跳转至 `/multi-view`
4. **NodeDetail 节点类型下拉**
   - 同步为新节点类型列表
5. **NodeDetail 内容类型下拉**
   - 新增报告、推演、计划、证据
6. **`typeLabel` 函数更新**
   - 在 `LeftSidebar` 与 `NodeDetail` 中分别更新节点类型与内容类型的中文标签映射

---

## 2026-06-18 Phase 4：循环与彩色连线

### 改动文件

- `components/MultiSelectToolbar.tsx`
- `components/Graph3D.tsx`

### 关键变更

1. **MultiSelectToolbar 改造**
   - 保留批量加标签、删除、清空
   - 新增 8 色预设颜色盘，对多选节点之间的连线批量上色
   - 新增「标记循环」按钮，将选中节点之间的连线 `variant` 设为 `cycle`
   - 新增主题输入框：可设置连线 `theme`，并支持「按主题拆分」
   - 新增「按颜色拆分」按钮：选择颜色后导出该颜色子图为新项目并保存
2. **Graph3D 连线渲染**
   - `linkColor`：优先使用 `link.color`，否则默认 slate 色
   - `linkWidth`：`cycle` 变体连线更粗（2.5px）
   - `linkDirectionalArrowColor`：与连线颜色保持一致

---

## 2026-06-18 Phase 5：嵌套结构 — 视图切换与渲染

### 改动文件

- `components/Graph3D.tsx`
- `app/page.tsx`
- `components/NodeDetail.tsx`

### 关键变更

1. **Graph3D 视图过滤**
   - 新增可选 `viewNodeId` prop，未提供时回退到 Store 的 `currentViewNodeId`
   - 使用 `useMemo` 过滤 `visibleNodes`（`parentId === viewNodeId`）与 `visibleLinks`
   - 多视图页面可独立传入 `viewNodeId`
2. **双击进入子网络**
   - `handleClick` 中实现双击检测（350ms 内同节点两次点击）
   - 双击调用 `enterNodeView(id)`
3. **节点拖拽成为子内容**
   - `onNodeDragEnd` 中计算释放节点与其他可见节点的距离
   - 若距离小于阈值（30），则调用 `moveNodeToParent` 将节点拖入最近节点
4. **面包屑导航**
   - `app/page.tsx` 新增 `BreadcrumbTrail` 组件
   - 显示「根视图 / ... / 当前节点」，支持点击返回上级或根视图
5. **NodeDetail 子节点 Tab**
   - 新增「子节点」标签页
   - 列出当前节点的所有子节点，可点击进入子网络或移出子节点

---

## 2026-06-18 Phase 6：拖拽交互

### 改动文件

- `components/NodeDetail.tsx`
- `app/page.tsx`
- `hooks/useGraphStore.ts`

### 关键变更

1. **内容条目可拖拽**
   - `ContentItemsTab` 中每个非编辑状态的内容卡片添加 `draggable`
   - `dragstart` 时写入 `application/heart-content-item` 数据（包含 `itemId` 与 `sourceNodeId`）
2. **图谱区域接收拖放**
   - `app/page.tsx` 中 Graph3D 外层容器添加 `onDragOver` 与 `onDrop`
   - 释放时调用 `moveContentItemToNode`，在当前视图下生成新节点
3. **类型修复**
   - 调整 `moveContentItemToNode` 签名，允许 `targetNodeId` 为 `string | null | undefined`
   - 生成节点时 `parentId` 统一转换为 `string | undefined`

---

## 2026-06-18 Phase 7：缩放自动进入子网络

### 改动文件

- `components/Graph3D.tsx`
- `components/LeftSidebar.tsx`

### 关键变更

1. **自动缩放进入逻辑**
   - 在 `Graph3D` 中新增 `setInterval`（250ms）轮询相机位置
   - 计算相机与每个可见节点的距离
   - 当最近节点距离小于阈值（节点半径 × 5 + 20）且该节点有子节点时，自动 `enterNodeView`
   - 增加 1200ms 冷却时间，避免频繁切换
2. **用户开关**
   - `LeftSidebar` 新增「缩放导航」区域
   - 提供复选框开启/关闭「缩放到节点时自动进入」
   - 状态持久化到 Store 的 `autoEnterOnZoom`

---

## 2026-06-18 Phase 8：多视图页面

### 改动文件

- `app/multi-view/page.tsx`（新增）
- `components/MultiViewGrid.tsx`（新增）
- `components/GraphViewPort.tsx`（新增）

### 关键变更

1. **新增 `/multi-view` 路由**
   - Next.js App Router 页面，渲染 `MultiViewGrid`
2. **MultiViewGrid**
   - 顶部工具栏：返回主视图、布局切换（双视图 / 三视图 / 四视图）
   - 使用 CSS Grid 分屏，每个格子一个 `GraphViewPort`
3. **GraphViewPort**
   - 独立的局部 `viewNodeId` 状态，不影响全局 Store
   - 每个视口独立渲染 `Graph3D`，可独立导航根视图或子网络
   - 底部显示当前选中节点简介

---

## 2026-06-18 Phase 9：构建、验证与打包

### 验证结果

- `npm run build`：通过，生成 `/` 与 `/multi-view` 静态页面
- 路由表确认包含 `/multi-view`

### 后续打包

- 执行 `npm run electron:pack:win` 生成 Windows 安装包
- 产物位于 `dist/宇宙之心 Setup 1.1.0.exe`

---

## 关键设计决策

1. **扁平 + parentId 的嵌套方案**
   - 所有节点存放在单一数组，通过 `parentId` 区分层级，避免子网络数据冗余
2. **视图状态分离**
   - 主视图使用全局 `currentViewNodeId`
   - 多视图页面每个 `GraphViewPort` 使用局部状态，互不干扰
3. **连线去重五元组**
   - 允许同一对节点之间存在多条不同语义/颜色的连线，满足「一条线变多条线」需求
4. **自动缩放默认开启但可关闭**
   - 兼顾沉浸体验与避免误操作
5. **删除节点级联子节点**
   - 父节点删除时，其内部子节点一并删除，符合「内容归属」语义

---

## 2026-06-19 Phase 10：v1.1 最终调整

### 改动文件

- `app/page.tsx`
- `components/Graph3D.tsx`
- `components/LeftSidebar.tsx`
- `components/NodeDetail.tsx`
- `components/WindowSync.tsx`（新增）
- `hooks/useViewportData.ts`（新增）
- `hooks/useGraphStore.ts`
- `electron/main.js`
- `electron/preload.js`
- `app/layout.tsx`

### 关键变更

1. **主视图子节点与摄影机回位**
   - 新增 `useViewportData` Hook：统一计算当前视图下应显示的节点/关系，包括中心节点与真实子节点。
   - 双击节点进入二级视图时，其 `contentItems` 与 `attachments` 会自动转换为真实子节点（内容转为 `note` 类型，附件转为 `paper` 类型），父节点自身的内容/附件列表清空，避免数据冗余。
   - 转换后的子节点与根视图节点操作逻辑完全一致：可选中、可在 `NodeDetail` 中添加内容/附件、可继续下钻。
   - `Graph3D` 新增 `resetCameraSignal` prop，主视图面包屑新增「回位」按钮，一键将摄影机重置到默认视角。

2. **多窗口替代多视图分屏**
   - Electron 主进程支持多 `BrowserWindow`，通过 IPC `open-window` 创建可自由调整大小的新窗口。
   - `preload.js` 暴露 `electronAPI.openWindow()`；在浏览器中回退为 `window.open` 新标签页。
   - 新增 `WindowSync` 组件监听 `storage` 事件，多窗口/多标签之间共享 `localStorage` 数据并自动同步。
   - 左侧边栏「打开多视图分屏」改为「打开新窗口」。

3. **添入子节点功能**
   - Store 新增 `moveNodesToParent(nodeIds, parentId)`：批量将选中节点移入目标父节点，并自动防止循环依赖。
   - 节点被移入父节点时，会同时在父节点的内容条目中生成一条摘要条目，便于在右侧详情面板查看。
   - 左侧边栏「关系连接」区域新增「添入子节点」按钮：选中目标父节点后，Shift+点击选择要移入的节点，点击按钮完成移入。

4. **移除缩放自动进入**
   - 删除 `Graph3D` 中的 `setInterval` 相机轮询与自动进入子网络逻辑。
   - 删除 `LeftSidebar` 中的「缩放到节点时自动进入」开关及 Store 中的 `autoEnterOnZoom` 状态。

5. **关系标签与 AI 优化**
   - Store 新增 `updateLink(source, target, updater)`，支持单独修改关系的说明、标签与颜色。
   - `NodeDetail`「关系」标签页重构：每条关系显示说明、标签与颜色；支持编辑、AI 优化、按标签拆分。
   - 新增「AI 优化关系」按钮：调用 `/api/chat` 为当前节点的所有关系生成双语说明、标签与颜色建议。
   - `Graph3D` 新增 `linkLabel`，在悬停时显示关系说明与标签。

6. **版本标识**
   - 主界面左上角版本号由 `v1.0` 更新为 `v1.1`。

7. **星云聚类视图增强**
   - 开启星云视图时连线透明度降低、宽度变细并隐藏箭头，减少视觉干扰。
   - 同类型节点之间的连线使用该类型颜色，不同类型之间使用暗灰色，实现「按类型的不同连接方式」。
   - 节点光晕改用加法混合，半径与透明度根据节点度数（连接数）动态增加，关系越多的节点越亮越大。

---

## 待后续优化

- 拖拽释放位置的 3D 坐标映射（当前新节点由 ForceGraph 自动布局）
- 按颜色/主题拆分项目后的历史记录（ChangeLog）自动写入
