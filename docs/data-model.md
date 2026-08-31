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
Node
├─ id          semantic snake_case, stable, session-unique
├─ type        goal | understanding | decision | option | task | drift
├─ title       one scannable sentence
├─ status?     short free-form label
├─ note?       optional one- or two-sentence explanation
└─ parentId?   optional display parent
```

约束：

- `id` 在 session 内稳定且唯一，例如 `refresh_race`、`server_idempotency`。
- `status` 是 display annotation，不参与状态机或 compact 筛选；避免重复 icon 已表达的信息。
- `note` 只放支持理解所必需的依据、trade-off 或条件，不充当 scratchpad。
- `parentId` 可自由嵌套，但必须引用现存节点且不能形成 cycle。Option 通常位于相关 Decision 下，这一语义由 Agent guidance 保持，不在 schema 中硬编码。Task 之间也可嵌套表达分组；嵌套只表达信息结构，不承载依赖、进度汇总或完成归档等执行追踪语义。
- 当前实现最多保留 32 个节点，促使 Agent 裁剪已经 resolved、done 或不再影响方向的内容。

## Mutation model

Agent 通过一个 `workmap` tool 维护状态：

- `update`：原子 upsert 完整节点，并可同时 remove 过期节点；
- `view`：读取当前 map；
- `clear`：清空当前 session 的 map。

更新保留已有节点的显示位置，新节点追加到末尾；唯一例外是 Heading 类型的 root 始终渲染在最前（技术文档的 Goals 小节惯例：锚先于细节）。任何 duplicate ID、missing parent 或 cycle 都会拒绝整次更新，不产生半完成状态。

## Session semantics

每次有效 mutation 都追加完整 snapshot 到 Pi session entries。恢复时从 `getEntries()` 而不是 `getBranch()` 读取最新合法 snapshot，因此：

- 同一 session 内执行 `/tree` 不会回滚 workmap；
- `resume` 恢复整场协作的最新 map；
- interactive fork 把当前内存 snapshot 写入新 session，之后独立演化；
- `new session` 从空 map 开始；
- snapshot 不自动进入 Agent context；extension 会为模型调用注入一份短暂、隐藏的 current-state reminder（只含结构与标题，note 是面向用户的对齐依据，不进入注入快照）。0.x 早期快照中的 `unknown` 节点在恢复时迁移为 `understanding`，`goal`/`direction` 节点迁移为 `heading`。

这与普通 branch-local todo 的因果回放不同：workmap 是整场协作当前共同看到的白板，而不是某个历史分支当时拥有的任务列表。
