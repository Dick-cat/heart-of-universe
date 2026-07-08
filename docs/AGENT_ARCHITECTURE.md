# 宇宙之心多 Agent 架构设计

> 目标：把 v1.1 的"单次调用模拟多角色"升级为 v1.3+ 的真正多 Agent 系统。

---

## 1. 为什么必须升级？

v1.1 的 Agent 集群本质上是**一个 LLM 调用 + 角色提示词分隔**：

- 优点：简单、一次出结果、适合快速原型。
- 缺点：
  - 无法让 Agent 之间互相引用、辩论、迭代。
  - 无法针对特定任务选择 specialist。
  - 无法在人类审批后让某个 Agent 继续工作。
  - Token 利用率低（一次性输出所有角色，上下文互相污染）。

真正的多 Agent 系统需要：
- 每个 Agent 独立调用、独立工具、独立记忆。
- Agent 之间通过结构化消息通信。
- 人类可以随时介入、修正、继续。

---

## 2. 推荐架构：MAPS（Multi-Agent with Project State）

针对"宇宙之心"的项目驱动 + 知识图谱特点，推荐**基于共享项目状态的多 Agent 架构**。

```text
┌─────────────────────────────────────────────┐
│              用户输入 / 目标                 │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│           Orchestrator 项目教练              │
│  解析目标 → 制定计划 → 选择 Agent → 调度执行  │
└──────────────────┬──────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼              ▼
 学术研究员     知识图谱员     证据审查员     实验设计师
   ↓              ↓              ↓              ↓
 搜索论文       创建节点       审查可信度     设计实验
 提取论断       建立关系       找漏洞         输出方案
   └──────────────┴──────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│           共享项目状态 Project State          │
│  目标卡 / 逻辑树 / 证据库 / 图谱节点 / 任务板  │
└─────────────────────────────────────────────┘
```

### 2.1 核心组件

| 组件 | 职责 | 对应 v3 模块 |
|---|---|---|
| **Orchestrator** | 理解用户目标，拆解任务，选择 Agent，管理执行顺序 | 项目教练 |
| **Academic Researcher** | 学术搜索、论文解析、方法评估、引用网络 | 文献研究员 |
| **Knowledge Mapper** | 把自然语言转化为图谱节点、关系、逻辑树 | 领域专家 |
| **Evidence Reviewer** | 审查节点/证据的可信度、方法论、一致性 | 审稿人/红队 |
| **Experiment Designer** | 设计最小实验、指标、环境、失败模式 | 实验设计师 |
| **Writer / Reporter** | 生成报告、论文片段、总结、复盘 | 写作助手 |

### 2.2 通信协议

Agent 之间不直接对话，而是通过 **Project State** 间接协作：

```typescript
interface AgentMessage {
  from: AgentId;
  to: AgentId | 'orchestrator' | 'user';
  action: 'search' | 'create_node' | 'review' | 'ask_human' | 'report';
  targetId?: string; // 节点/目标/证据 ID
  payload: unknown;
  reasoning: string; // 该 Agent 的思考过程
}
```

### 2.3 执行模式

| 模式 | 说明 | 适用场景 |
|---|---|---|
| **Single** | 用户直接调用某个 Agent | 快速搜索、审查单个节点 |
| **Pipeline** | Orchestrator 按顺序调用多个 Agent | 标准项目流程 |
| **Debate** | 两个 Agent 就同一问题提出不同观点 | 高风险决策 |
| **Human-in-the-loop** | 每步结果需用户确认再继续 | 关键审查门 |

---

## 3. 与现有代码的衔接

| 现有能力 | 如何被 Agent 使用 |
|---|---|
| `lib/academic-search.ts` | Academic Researcher 的工具 |
| `lib/evidence-review.ts` | Evidence Reviewer 的工具 |
| `lib/ai-evidence-review.ts` | Evidence Reviewer 的 AI 深度审查 |
| `useGraphStore` | Knowledge Mapper 的操作对象 |
| `lib/visual-supervision.ts` | 评估用户学习/工作投入质量 |
| `BottomConsole` | Agent 控制台 UI |

---

## 4. 为什么不用 LangGraph / CrewAI / AutoGen？

| 框架 | 优点 | 为什么不优先使用 |
|---|---|---|
| **LangGraph** | 状态机清晰、适合复杂工作流 | 增加依赖，对本地优先/离线场景不友好 |
| **CrewAI** | 角色扮演简单 | 黑盒度高，难以与我们的图谱 store 深度集成 |
| **AutoGen** | 对话型多 Agent，适合编码 | 需要长对话上下文，Token 消耗大 |
| **自定义 MAPS** | 轻量、可控、与图谱深度集成 | 需要自己实现调度逻辑 |

**推荐：自定义 MAPS**。在 v1.3 中先实现轻量版，未来如果工作流极度复杂，可以再引入 LangGraph 作为底层引擎。

---

## 5. v1.3 实现范围

### 5.1 先做 3 个 Agent

1. **Orchestrator**：项目教练，接收目标并调度。
2. **Academic Researcher**：学术搜索 + 论文解析。
3. **Knowledge Mapper**：把 Agent 输出转为图谱节点。

### 5.2 控制台能力

- 用户选择 Agent 并输入任务。
- 显示 Agent 执行步骤、思考过程、输出结果。
- 一键把结果导入图谱。

### 5.3 后续扩展

- Evidence Reviewer Agent
- Experiment Designer Agent
- Debate 模式
- 自动调度（Orchestrator 自动选择 Agent）

---

## 6. 关于 FARS 与 AI4S

你提到的 **FARS 论文工厂**与**智谱 AI4S** 都是领域特定的 Agent/工具链：

- **FARS（假设为学术文献自动生成/审查框架）**：适合做学术研究员 Agent 的参考实现，关注论文结构、方法学、引用网络。
- **智谱 AI4S**：适合做生物/化学/材料科学领域的 specialist Agent，可以接入 GLM-4 模型或调用科学计算工具。

在 MAPS 架构中，这些都可以作为 **可插拔的 specialist Agent** 接入，而不影响整体框架。

---

*版本：v1.3 Agent 架构设计*
*最后更新：2026-06-20*
