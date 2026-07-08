# 宇宙之心 - AI Knowledge Graph

> **宇宙之心 v1.8.4** — AI 驱动的 3D 知识图谱与认知训练桌面应用
>
> 一个本地优先、隐私优先的个人认知系统。支持 AI 辅助学习、3D/2D 知识网络、视觉监督、认知训练和项目执行。

---

## 📋 目录

- [功能特性](#功能特性)
- [技术架构](#技术架构)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [使用技巧](#使用技巧)
- [认知训练模式](#认知训练模式)
- [Agent 集群](#agent-集群)
- [修改日志](#修改日志)
- [版本路线](#版本路线)
- [注意事项](#注意事项)

---

## ✨ 功能特性

### 🧠 核心能力
- 🌐 **3D 知识网络**：基于 `react-force-graph-3d` 的交互式力导向图，支持嵌套子网络、多窗口视图
- 🤖 **AI 辅助学习**：DeepSeek / Kimi 自动解析并生成中英双语节点与关系
- 📝 **Zotero 式内容**：每个节点可包含多条带标签的摘要/笔记/摘录/批注
- 🏷️ **智能标签**：AI 自动为节点或内容条目推荐标签
- 🔗 **可视连边**：选中源节点后 Shift+点击目标节点即可创建关系
- ✨ **星云聚类**：大规模图谱下按类型聚合显示
- 🖱️ **批量操作**：Shift 多选节点，批量添加标签或删除

### 🎯 认知训练
- 🧘 **认知训练模式**：强制阅读、自写摘要、手动建节点后再应用 AI 输出，防止被动接受
- �️ **视觉监督**：基于 MediaPipe FaceMesh 的视线追踪、疲劳监测（本地推理，隐私优先）
- � **注意力评分**：多维度评估学习专注度（阅读覆盖度、交互密度、摘要质量等）

### 👥 协作能力
- 🧠 **Agent 集群**：模拟多角色工程专家（需求/架构/规划/评估/研究）给出共识建议
- 📝 **修改日志**：每次 AI 对话后自动记录节点与关系的变化

### 🖥️ 部署方式
- 桌面软件：基于 Electron 封装，可打包为 Windows 安装程序
- Web 端：Next.js App Router，支持浏览器访问

---

## 🏗️ 技术架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Electron 外壳                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Next.js Web 应用                       │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐  │  │
│  │  │  UI层    │  │  业务层  │  │     数据层             │  │  │
│  │  │ components│  │ lib/hooks│  │  Dexie (IndexedDB)    │  │  │
│  │  └────┬─────┘  └────┬─────┘  └────────────────────────┘  │  │
│  │       │             │                                     │  │
│  │       └──────┬──────┘                                     │  │
│  │              ▼                                            │  │
│  │  ┌────────────────────────────────────────────────┐      │  │
│  │  │              API 网关                           │      │  │
│  │  │  /api/chat    /api/agents                      │      │  │
│  │  └────────────────────────────────────────────────┘      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │     外部服务                  │
              │  DeepSeek/Kimi LLM API       │
              └───────────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| **框架** | Next.js 14 + React 18 | SSR/SSG Web 应用 |
| **桌面端** | Electron 31 | 跨平台桌面封装 |
| **3D 渲染** | Three.js + react-force-graph-3d | 知识图谱可视化 |
| **状态管理** | Zustand | 轻量级全局状态 |
| **数据库** | Dexie (IndexedDB) | 本地优先存储 |
| **人脸检测** | MediaPipe FaceMesh | 视觉监督功能 |
| **样式** | TailwindCSS 3 | CSS 框架 |

### 模块架构

```
├── app/                    # Next.js App Router
│   ├── api/                # API 路由（LLM 代理、代理管理）
│   ├── layout.tsx          # 根布局
│   └── page.tsx            # 首页
├── components/             # React 组件
│   ├── Graph3D.tsx         # 3D 图谱渲染
│   ├── ChatPanel.tsx       # AI 对话面板
│   ├── VisualSupervisionPanel.tsx  # 视觉监督面板
│   ├── CognitiveTrainingPanel.tsx  # 认知训练面板
│   └── ...
├── hooks/                  # React Hooks
│   ├── useGraphStore.ts    # 图谱状态管理
│   ├── useVisualSupervisor.ts  # 视觉监督 Hook
│   └── ...
├── lib/                    # 核心业务逻辑
│   ├── visual-supervision.ts  # 视觉监督核心
│   ├── reasoning.ts        # 逻辑推理引擎
│   ├── agents/             # AI 代理层
│   └── ...
└── electron/               # Electron 主进程
```

### 数据流

#### AI 对话流程
```
ChatPanel → lib/agents/llm.ts → /api/chat → DeepSeek/Kimi API → 返回结果
```

#### 视觉监督流程
```
摄像头 → MediaPipe FaceMesh → visual-supervision.ts → useVisualSupervisor → UI 显示
                                                               ↓
                                                    状态更新（有效时间、专注分数）
```

#### 知识图谱流程
```
用户操作 → useGraphStore → Dexie DB → Graph3D 渲染
```

---

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone <your-repo-url>
cd ai-knowledge-graph
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 LLM API Key

```bash
# 复制示例配置文件
cp .env.example .env.local

# 编辑 .env.local，填入你的 API Key
```

`.env.example` 已包含常用配置模板：

**支持的 LLM 提供商：**

| 提供商 | 环境变量 | 默认 URL | 默认模型 |
|--------|----------|----------|----------|
| DeepSeek | `LLM_PROVIDER=deepseek` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Kimi | `LLM_PROVIDER=kimi` | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 自定义 | - | `LLM_BASE_URL` | `LLM_MODEL` |

### 4. 开发模式

```bash
npm run dev
```

访问 http://localhost:3000

### 5. 桌面模式（开发）

```bash
npm run electron:dev
```

这会先构建 Next.js，再启动 Electron 窗口。

---

## 📦 打包为桌面软件

### Windows 安装包

```bash
npm run electron:pack:win
```

打包完成后，安装程序位于 `dist/` 目录下：`AI Knowledge Graph Setup.exe`

---

## 📂 项目结构

```
ai-knowledge-graph/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── chat/route.ts   # LLM API 代理
│   │   └── agents/route.ts # 代理管理接口
│   ├── multi-view/         # 多视图页面
│   ├── globals.css         # 全局样式
│   ├── layout.tsx          # 根布局
│   └── page.tsx            # 首页
├── components/             # React 组件
│   ├── agents/             # 代理相关组件
│   ├── Graph3D.tsx         # 3D 图谱渲染
│   ├── ChatPanel.tsx       # AI 对话面板
│   ├── NodeDetail.tsx      # 节点详情
│   ├── VisualSupervisionPanel.tsx  # 视觉监督面板
│   ├── CognitiveTrainingPanel.tsx  # 认知训练面板
│   ├── LeftSidebar.tsx     # 左侧导航栏
│   ├── ProjectPanel.tsx    # 项目管理面板
│   ├── MultiSelectToolbar.tsx  # 多选工具栏
│   └── MarkdownRenderer.tsx  # Markdown 渲染
├── electron/               # Electron 主进程
│   ├── main.js             # 主进程入口
│   └── preload.js          # 预加载脚本
├── hooks/                  # React Hooks
│   ├── useGraphStore.ts    # Zustand 全局状态
│   ├── useVisualSupervisor.ts  # 视觉监督状态
│   ├── useAttentionTracker.ts  # 注意力追踪
│   └── useAutoSave.ts      # 自动保存
├── lib/                    # 核心业务逻辑
│   ├── agents/             # AI 代理层
│   │   ├── llm.ts          # LLM 调用封装
│   │   ├── orchestrator.ts # 代理编排器
│   │   └── types.ts        # 代理类型定义
│   ├── visual-supervision.ts  # 视觉监督核心
│   ├── reasoning.ts        # 逻辑推理引擎
│   ├── evidence-review.ts  # 证据审查
│   ├── ai-grading.ts       # AI 生成内容分级与关系判断
│   ├── cognitive-training.ts  # 认知训练
│   ├── conflict-detection.ts  # 冲突检测
│   ├── types.ts            # 类型定义
│   ├── db.ts               # Dexie IndexedDB
│   ├── llm.ts              # Prompt 与 JSON 处理
│   └── graph-utils.ts      # 图谱工具函数
├── docs/                   # 文档
│   ├── VERSION_ROADMAP.md  # 版本路线图
│   ├── ALGORITHM_DESIGN.md # 算法设计文档
│   ├── v2_0_PROPOSAL.md    # v2.0 升级提案
│   └── ...
├── public/                 # 静态资源
│   └── icon.ico            # 应用图标
├── package.json            # 项目配置
├── next.config.js          # Next.js 配置
├── tailwind.config.ts      # TailwindCSS 配置
└── tsconfig.json           # TypeScript 配置
```

---

## 💡 使用技巧

| 操作 | 说明 |
|------|------|
| 左键点击节点 | 选中并在右侧显示详情 |
| Shift+点击节点 | 多选节点 |
| 选中节点后 Shift+点击另一节点 | 创建从源到目标的关系 |
| 右侧「信息」标签页 → 删除节点 | 删除当前节点 |
| 鼠标悬停节点 | 显示该节点的内容条目摘要 |
| 左侧工具栏 | 搜索、手动加节点、AI 打标签/总结、星云视图 |

---

## 🧘 认知训练模式

开启左下角「🧘 认知训练模式」后，AI 输出不会立即写入知识图谱，而是进入训练闭环：

1. **阅读足够时间**：按文本长度动态计算（最少 30 秒）
2. **滚动浏览**：至少浏览 50% 的内容
3. **自写摘要**：用自己的话写一段摘要
4. **手动创建节点**：根据摘要手动创建一个节点
5. **应用 AI 输出**：完成后才能应用 AI 生成的完整节点与关系

该模式适合希望避免被动接受 AI、强化主动思考的学习者。

---

## 🧠 Agent 集群

点击右下角「🧠 Agent 集群」，输入工程或设计问题，系统会模拟五位专家进行讨论：

- **需求分析师**：分析需求合理性与完整性
- **系统架构师**：设计技术方案与架构
- **方案规划师**：制定实施计划与时间线
- **评估批评者**：评估风险与潜在问题
- **领域研究员**：搜索相关知识与最佳实践

最终给出共识总结与可直接导入知识图谱的节点/关系数据。

---

## 📝 修改日志

每次 AI 对话后，左下角「📝 修改日志」会记录：

- 新增/更新/移除的节点
- 新增的关系数量
- 对应的用户提示词与时间戳

---

## 📈 版本路线

### v1.x（当前）：个人知识图谱工具
- ✅ 3D 知识图谱可视化
- ✅ AI 辅助节点生成
- ✅ 认知训练模式
- ✅ 视觉监督（本地）
- ✅ Agent 集群

### v2.0（规划中）：多人协作平台
详情请见 `docs/v2_0_PROPOSAL.md`：

- 🔄 **后端架构**：NestJS + PostgreSQL + Redis
- 🔄 **实时协作**：Yjs CRDT 多人编辑
- 🔄 **用户系统**：账号认证、角色权限、组织管理
- 🔄 **云同步**：跨设备数据同步、离线优先
- 🔄 **专业模式**：学术数据库接入（OpenAlex、arXiv）
- 🔄 **超能审查**：证据可信度评估、反造假检测

---

## ⚠️ 注意事项

- `.env.local` 包含 API Key，**不要提交到 Git 仓库**（已加入 `.gitignore`）
- 本地文件附件使用浏览器 object URL，刷新后需重新上传；URL 附件可持久保存
- 视觉监督模块默认关闭，开启前需用户授权，所有处理均在本地完成
- 生产打包前确保已运行 `npm run build`

---

## 📄 License

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

*宇宙之心 — 人人可为，人人能为*
