# Data Model

## 设计原则

V1 是一个 Agent-maintained、session-global 的 typed tree。节点表达当前仍影响 Agent 方向的信息，而不是保存完整历史。一个 session 可以有多个平级 Heading；Heading 不是其他元素的强制容器，也不增加 Workstream。

UI 以 tree 为主，每个节点最多一个可选 `parentId`。V1 不提供 refs、cross-reference 或 DAG renderer；`parentId` 只服务信息表达与阅读顺序，不承担工作组织语义。

## Node types

| Type | 含义 | 典型内容 |
|---|---|---|
| `heading` | Agent 对用户意图的当前理解——可证伪的转述，全图的锚 | “Keep users signed in reliably” |
| `understanding` | Agent 当前采用的事实、综合解释、推断或 hypothesis | “Refresh requests occasionally overlap” |
| `decision` | 正在权衡的选择或已经作出的承诺 | “Refresh serialization ownership” / “Use server-side idempotency” |
| `option` | Decision 的 considered alternative | “Serialize in the client” |
| `task` | 由当前 working model 导出的行动 | “Trace worker IDs on concurrent refreshes” |
| `drift` | 已检测到的实际方向与 user intent 或现行 map 的偏差 | “The client-only fix assumes a single worker” |

### 关键区分

- `Understanding` 同时覆盖过去讨论中的 Finding 与综合 mental model；自由 `status` 可写 `observed`、`inferred` 或 `hypothesis`。
- 事实问题不设节点类型：能查的直接调查，只有用户能答的在对话中问；待验证的临时答案写成 `Understanding`，状态用 `hypothesis`。
- `Decision` 通过权衡后承诺。斟酌中时 title 可写成疑问句；拍板后把结论**追加**到标题（“…? → 结论”），而不是改写掉问题——问题保留了 Agent 对决策空间的框定（这个选择是关于什么维度的），框定本身是对齐材料，用户能据此发现框错维度的情况。compact 中 Option 常折叠进 `… more`，标题必须自带答案，追加同样满足。
- `Option` 只属于 Decision 的方案空间。
- blocked work 使用 Task 的 `status: blocked` 与 `note`，不设 Blocker node。
- 长期方向仍使用 Heading，状态写 `long-term`；它只是当前 session 使用的副本，不获得跨 session memory。

## Node shape

```text
Root（顶层树）
├─ id          semantic snake_case, stable, session-unique
├─ type        heading | understanding | decision | option | task | drift
├─ title       one scannable sentence
├─ status?     short free-form label
├─ note?       optional one- or two-sentence explanation
└─ children?   Child[]（递归；Child 与 Root 同构但没有 id）
```

约束：

- 只有 root 携带 `id`，例如 `refresh_race`、`server_idempotency`；子节点无 id，随树生灭（ADR 0011）。
- `status` 是 display annotation，不参与状态机或 compact 筛选；避免重复 icon 已表达的信息。
- `note` 只放支持理解所必需的依据、trade-off 或条件，不充当 scratchpad。
- `children` 自由嵌套（深度上限 8），single-parent 由构造保证——不存在 dangling parent 或 cycle。Option 通常位于相关 Decision 下，这一语义由 Agent guidance 保持。Task 之间也可嵌套表达分组；嵌套只表达信息结构，不承载依赖、进度汇总或完成归档等执行追踪语义。
- 当前实现最多保留 32 个节点（递归计数），促使 Agent 裁剪已经 resolved、done 或不再影响方向的内容。

## Mutation model

Agent 通过一个 `workmap` tool 维护状态：

- `update`：以**整棵树**为粒度 upsert（按 root id 原位替换整个子树）或按 root id 移除；
- `view`：读取当前 map；
- `clear`：清空当前 session 的 map。

Upsert 已存在的 root 保留其显示位置，新 root 追加到末尾；唯一例外是 Heading 类型的 root 始终渲染在最前（技术文档的 Goals 小节惯例：锚先于细节）。替换是整体的：重发 root 时遗漏 `children` 即删除该子树。任何 duplicate root id、子节点携带 id 或超深嵌套都会拒绝整次更新，不产生半完成状态。每次成功调用后，tool result 回显当前树的紧凑文本，让模型核对自己声明的结构。

## Session semantics

每次有效 mutation 都追加完整 snapshot 到 Pi session entries。恢复时从 `getEntries()` 而不是 `getBranch()` 读取最新合法 snapshot，因此：

- 同一 session 内执行 `/tree` 不会回滚 workmap；
- `resume` 恢复整场协作的最新 map；
- interactive fork 把当前内存 snapshot 写入新 session，之后独立演化；
- `new session` 从空 map 开始；
- snapshot 不自动进入 Agent context；extension 会在每个 agent run 前为模型重新注入一份隐藏的 current-state 快照（只含结构与标题，note 是面向用户的对齐依据，不进入注入快照；快照尾部附 staleness 计数，见 [ADR 0010](adr/0010-staleness-counter-reinjection.md)）。v1（flat/parentId）快照不迁移：workmap 是当前态势感知而非长期存储，旧 map 随会话演进自然过期（ADR 0011）。

这与普通 branch-local todo 的因果回放不同：workmap 是整场协作当前共同看到的白板，而不是某个历史分支当时拥有的任务列表。
