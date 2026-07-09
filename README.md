# Heart of Universe | 宇宙之心

> **Heart of Universe v1.8.4** — An AI-powered 3D knowledge graph and cognitive training desktop application.
>
> **宇宙之心 v1.8.4** — AI 驱动的 3D 知识图谱与认知训练桌面应用。
>
> A local-first, privacy-first personal cognitive system. Supports AI-assisted learning, 3D/2D knowledge networks, visual supervision, cognitive training, and project execution.
>
> 一个本地优先、隐私优先的个人认知系统。支持 AI 辅助学习、3D/2D 知识网络、视觉监督、认知训练和项目执行。

---

## 🌍 Language | 语言

The application supports **English** and **中文 (Chinese)**. Switch anytime from the top-right language selector.

应用支持 **English** 和 **中文**。可随时通过右上角语言选择器切换。

---

## 📋 Table of Contents | 目录

- [Features | 功能特性](#features--功能特性)
- [Tech Stack | 技术架构](#tech-stack--技术架构)
- [Quick Start | 快速开始](#quick-start--快速开始)
- [Project Structure | 项目结构](#project-structure--项目结构)
- [Tips | 使用技巧](#tips--使用技巧)
- [Cognitive Training | 认知训练模式](#cognitive-training--认知训练模式)
- [Agent Cluster | Agent 集群](#agent-cluster--agent-集群)
- [Changelog | 修改日志](#changelog--修改日志)
- [Roadmap | 版本路线](#roadmap--版本路线)
- [Notes | 注意事项](#notes--注意事项)

---

## Features | 功能特性

### 🧠 Core | 核心能力

- 🌐 **3D Knowledge Network | 3D 知识网络**: Interactive force-directed graph based on `react-force-graph-3d`, supporting nested sub-networks and multi-window views. 基于 `react-force-graph-3d` 的交互式力导向图，支持嵌套子网络、多窗口视图。
- 🤖 **AI-Assisted Learning | AI 辅助学习**: DeepSeek / Kimi / OpenAI auto-parse topics and generate bilingual nodes and relations. DeepSeek / Kimi / OpenAI 自动解析并生成中英双语节点与关系。
- 📝 **Zotero-Style Content | Zotero 式内容**: Each node can hold multiple tagged summaries, notes, excerpts, and annotations. 每个节点可包含多条带标签的摘要/笔记/摘录/批注。
- 🏷️ **Smart Tags | 智能标签**: AI recommends tags for nodes and content items. AI 自动为节点或内容条目推荐标签。
- 🔗 **Visual Links | 可视连边**: Select a source node, then Shift+click a target node to create a relation. 选中源节点后 Shift+点击目标节点即可创建关系。
- ✨ **Nebula Clustering | 星云聚类**: Aggregate nodes by type in large-scale graphs. 大规模图谱下按类型聚合显示。
- 🖱️ **Batch Operations | 批量操作**: Shift+multi-select nodes to add tags or delete in bulk. Shift 多选节点，批量添加标签或删除。

### 🎯 Cognitive Training | 认知训练

- 🧘 **Cognitive Training Mode | 认知训练模式**: Force reading, self-written summary, and manual node creation before applying AI output to prevent passive acceptance. 强制阅读、自写摘要、手动建节点后再应用 AI 输出，防止被动接受。
- 👁️ **Visual Supervision | 视觉监督**: Gaze tracking and fatigue detection based on MediaPipe FaceMesh (local inference, privacy-first). 基于 MediaPipe FaceMesh 的视线追踪、疲劳监测（本地推理，隐私优先）。
- 📊 **Attention Score | 注意力评分**: Multi-dimensional focus evaluation (reading coverage, interaction density, summary quality, etc.). 多维度评估学习专注度（阅读覆盖度、交互密度、摘要质量等）。

### 👥 Collaboration | 协作能力

- 🧠 **Agent Cluster | Agent 集群**: Simulates multi-role engineering experts (requirement / architecture / planning / evaluation / research) to give consensus suggestions. 模拟多角色工程专家（需求/架构/规划/评估/研究）给出共识建议。
- 📝 **Change Log | 修改日志**: Automatically records node and relation changes after each AI conversation. 每次 AI 对话后自动记录节点与关系的变化。

### 🖥️ Deployment | 部署方式

- **Desktop | 桌面软件**: Packaged with Electron as a Windows installer. 基于 Electron 封装，可打包为 Windows 安装程序。
- **Web | Web 端**: Next.js App Router, accessible via browser. Next.js App Router，支持浏览器访问。

---

## Tech Stack | 技术架构

### Overall Architecture | 整体架构

```text
┌─────────────────────────────────────────────────────────────────┐
│                      Electron Shell | Electron 外壳              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Next.js Web App | Web 应用             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐  │  │
│  │  │  UI Layer│  │ Business │  │      Data Layer        │  │  │
│  │  │ UI层     │  │ 业务层   │  │  Dexie (IndexedDB)     │  │  │
│  │  └────┬─────┘  └────┬─────┘  └────────────────────────┘  │  │
│  │       │             │                                     │  │
│  │       └──────┬──────┘                                     │  │
│  │              ▼                                            │  │
│  │  ┌────────────────────────────────────────────────┐      │  │
│  │  │              API Gateway | API 网关             │      │  │
│  │  │  /api/chat    /api/agents                      │      │  │
│  │  └────────────────────────────────────────────────┘      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
│              │     External Services | 外部服务                  │
│              │  DeepSeek / Kimi / OpenAI LLM API                 │
└───────────────────────────────────────────────────────────────────┘
```

### Stack | 技术栈

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | Next.js 14 + React 18 | SSR/SSG Web app |
| **Desktop** | Electron 31 | Cross-platform desktop wrapper |
| **3D Rendering** | Three.js + react-force-graph-3d | Knowledge graph visualization |
| **State** | Zustand | Lightweight global state |
| **Database** | Dexie (IndexedDB) | Local-first storage |
| **i18n** | react-i18next | English / Chinese localization |
| **Face Detection** | MediaPipe FaceMesh | Visual supervision |
| **Styling** | TailwindCSS 3 | CSS framework |

---

## Quick Start | 快速开始

### 1. Clone | 克隆仓库

```bash
git clone https://github.com/Dick-cat/heart-of-universe.git
cd heart-of-universe
```

### 2. Install Dependencies | 安装依赖

```bash
npm install
```

### 3. Configure LLM API Key | 配置 LLM API Key

```bash
# Copy the example config | 复制示例配置
cp .env.example .env.local

# Edit .env.local and fill in your API Key | 编辑 .env.local，填入你的 API Key
```

**Supported Providers | 支持的 LLM 提供商：**

| Provider | Env Variable | Default URL | Default Model |
|---|---|---|---|
| DeepSeek | `LLM_PROVIDER=deepseek` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Kimi | `LLM_PROVIDER=kimi` | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| OpenAI | `LLM_PROVIDER=openai` | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Custom | - | `LLM_BASE_URL` | `LLM_MODEL` |

### 4. Dev Mode | 开发模式

```bash
npm run dev
```

Visit http://localhost:3000

### 5. Desktop Dev Mode | 桌面模式（开发）

```bash
npm run electron:dev
```

This builds Next.js first, then launches the Electron window. 这会先构建 Next.js，再启动 Electron 窗口。

---

## Packaging | 打包为桌面软件

### Windows Installer | Windows 安装包

```bash
npm run electron:pack:win
```

After packaging, the installer is in `dist/`: `AI Knowledge Graph Setup.exe`. 打包完成后，安装程序位于 `dist/` 目录下。

---

## Project Structure | 项目结构

```
heart-of-universe/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (LLM proxy, agent management)
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main page
├── components/             # React components
│   ├── Graph3D.tsx         # 3D graph rendering
│   ├── ChatPanel.tsx       # AI chat panel
│   ├── NodeDetail.tsx      # Node detail panel
│   ├── VisualSupervisionPanel.tsx  # Visual supervision panel
│   ├── CognitiveTrainingPanel.tsx  # Cognitive training panel
│   ├── LeftSidebar.tsx     # Left sidebar
│   ├── ProjectPanel.tsx    # Project management panel
│   ├── LanguageSwitcher.tsx        # Language switcher
│   └── ...
├── hooks/                  # React Hooks
│   ├── useGraphStore.ts    # Zustand global state
│   └── ...
├── lib/                    # Core business logic
│   ├── agents/             # AI agent layer
│   ├── i18n.ts             # i18n configuration
│   ├── locales/            # Translation files (en, zh)
│   └── ...
├── electron/               # Electron main process
├── docs/                   # Documentation
├── public/                 # Static assets
└── package.json
```

---

## Tips | 使用技巧

| Action | Description |
|---|---|
| Left-click node | Select and show details on the right |
| Shift+click node | Multi-select nodes |
| Select node then Shift+click another | Create relation from source to target |
| Right-click 3D background | Open context menu to add node |
| Bottom "Input" tab | Add nodes and relations |
| Left sidebar | Search, quick add, AI tagging/summarizing, nebula view |

---

## Cognitive Training | 认知训练模式

Turn on "🧘 Cognitive Training" in the bottom-left corner. AI output will not be written to the graph immediately; instead it enters a training loop:

1. **Read enough time | 阅读足够时间**: Dynamically calculated by text length (minimum 30s).
2. **Scroll coverage | 滚动浏览**: Browse at least 50% of the content.
3. **Self-written summary | 自写摘要**: Write a summary in your own words.
4. **Manual node | 手动创建节点**: Create at least one node manually based on the summary.
5. **Apply AI output | 应用 AI 输出**: Only then can the AI-generated nodes and relations be applied.

This mode helps learners avoid passively accepting AI output and strengthens active thinking. 该模式适合希望避免被动接受 AI、强化主动思考的学习者。

---

## Agent Cluster | Agent 集群

Click "🧠 Agent Cluster" in the bottom-right corner, enter an engineering or design question, and the system simulates five experts discussing:

- **Requirement Analyst | 需求分析师**: Analyzes requirement rationality and completeness.
- **System Architect | 系统架构师**: Designs technical solutions and architecture.
- **Solution Planner | 方案规划师**: Formulates implementation plans and timelines.
- **Evaluator / Critic | 评估批评者**: Evaluates risks and potential issues.
- **Domain Researcher | 领域研究员**: Supplements relevant theories and resources.

The final output is a consensus summary and node/relation data that can be imported into the knowledge graph. 最终给出共识总结与可直接导入知识图谱的节点/关系数据。

---

## Changelog | 修改日志

After each AI conversation, the bottom-left "📝 Change Log" records:

- New / updated / removed nodes
- New relation count
- User prompt and timestamp

---

## Roadmap | 版本路线

### v1.x (Current | 当前)

- ✅ 3D knowledge graph visualization
- ✅ AI-assisted node generation
- ✅ Cognitive training mode
- ✅ Visual supervision (local)
- ✅ Agent cluster
- ✅ English / Chinese i18n

### v2.0+ (Planned | 规划中)

See `docs/v2_0_PROPOSAL.md` and `docs/v4_0_ARCHITECTURE.md` for detailed proposals.

- Backend architecture (NestJS + PostgreSQL + Redis)
- Real-time collaboration (Yjs CRDT)
- User system, roles, and permissions
- Cross-device sync with offline-first support
- Academic mode (OpenAlex, arXiv)
- Evidence credibility review and anti-fraud detection
- Enterprise task network integration

---

## Notes | 注意事项

- `.env.local` contains API keys. **Do not commit it to Git** (already in `.gitignore`). `.env.local` 包含 API Key，**不要提交到 Git**（已加入 `.gitignore`）。
- Local file attachments use browser object URLs; re-upload after refresh. URL attachments persist. 本地文件附件使用浏览器 object URL，刷新后需重新上传；URL 附件可持久保存。
- Visual supervision is off by default. It requires user authorization, and all processing happens locally. 视觉监督模块默认关闭，开启前需用户授权，所有处理均在本地完成。
- Run `npm run build` before production packaging. 生产打包前确保已运行 `npm run build`。

---

## 📄 License | 许可证

MIT License

---

## 🤝 Contributing | 贡献

Issues and Pull Requests are welcome! 欢迎提交 Issue 和 Pull Request！

---

*Heart of Universe | 宇宙之心 — Everyone can learn, everyone can do.*
