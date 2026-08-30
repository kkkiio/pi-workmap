# ADR 0002: V1 只有 `parentId` 一种关系，不做 refs 或 DAG

- Status: Accepted
- Date: 2026-08-30

## Context

Workmap 节点之间天然存在横向关系：Task 可能为了回答某个 Unknown，Option 服务某个 Goal，Understanding 支撑某个 Decision。工程直觉会把这些关系建模成 refs 或 DAG，让结构更"完整"。

但 workmap 内容的受众是**扫读的人**，不是查询的机器。它渲染在 editor 上方的常驻 widget 里，终端宽度有限，用户的目标是几秒钟内判断"Agent 现在的方向对不对"，而不是遍历关系图。同时 map 由 LLM Agent 在对话过程中主动维护，关系越复杂，维护出错的概率越高。

## Decision

V1 中节点之间唯一的关系是可选的 `parentId`，构成 single-parent tree：

- 不提供 refs、cross-reference 字段或 DAG 渲染。
- 不引入 Workstream 等额外容器，也不要求 Goal 必须组织其他节点；任何节点都可以是 root，多个 Goal 可以平级。
- 嵌套完全自由：任何类型可以挂在任何类型下，只要读起来更清楚。Option 通常位于相关 Decision 下，这一语义由 Agent guidance 保持，不在 schema 中硬编码。
- 无法用树表达的关联（如"这个 Task 回答那个 Unknown"）写成 title 或 note 中的自然语言，而不是结构化字段。

```text
◎ Goal
├─ • Understanding
├─ ? Unknown
└─ ◆ Decision
   ├─ ◇ Option
   └─ ◇ Option
```

## Rationale

Single-parent tree 是终端文本 UI 中唯一能被一眼扫读的层级结构：缩进和 `├─ └─` connector 不需要图布局，窄宽度下退化为截断而不是乱序。DAG 的边在纯文本渲染中必然交叉或省略，反而损害它声称要服务的理解。

这也符合 workmap 的真值标准——"现在是否足以让双方协调下一步"。结构化关系服务的是审计、查询、回溯等 durable knowledge 场景，那些属于 ADR 与 design docs；session workmap 只需要让人看出"什么在什么之下"。

对维护者同样更可靠：LLM 维护单一可选字段几乎不会出错，而 refs 会产生悬置引用、环和同步问题，这些失败都会直接显示在用户脸上。

## Alternatives considered

### Refs / cross-reference 数组

节点携带 `refs: string[]` 指向相关节点。表达力更强，但终端 widget 无法可扫读地渲染它们，最终只能显示为 id 列表，把阅读负担转嫁给用户；同时引入悬置引用和环的处理成本。

### DAG 渲染

允许任意图结构并做图布局。文本 UI 中边必然交叉或被裁剪，宽度受限时完全不可用；图布局算法的复杂度与产品"几秒扫读"的目标不成比例。

### Workstream / 强制 Goal 归属

引入分组容器或要求所有节点挂在 Goal 下，能给 map 更强的组织性，但 Goal 本身是可选信号；强制归属会把容器仪式强加给简单 session，也让 Agent 为找不到归属的节点编造无意义的分组。

## Consequences

### Positive

- 渲染、持久化与恢复逻辑都保持简单：一个可选字段，无环检测成本极低。
- Agent 维护负担最小，关系错误几乎不可能出现。
- 任何终端宽度下树都可扫读，退化方式只有截断。

### Trade-offs

- 无法结构化表达横向关联；相关信息只能通过嵌套位置或 title/note 的措辞暗示。
- 如果未来出现真实的查询、审计需求，应设计独立的 history/export 能力，而不是给节点模型加关系字段。

## Implementation note

`src/types.ts` 的 `WorkmapNode.parentId` 是唯一的关系字段；`src/widget.ts` 按 single-parent tree 渲染。任何为节点模型增加关系字段、或把 widget 改为图渲染的实现，都需要先取代本 ADR。
