# Data Model

## 设计原则

V1 是一个 Agent-maintained、session-global 的 typed tree。节点表达当前仍影响 Agent 方向的信息，而不是保存完整历史。一个 session 可以有多个平级 Goal；Goal 不是其他元素的强制容器，也不增加 Workstream。

UI 以 tree 为主，每个节点最多一个可选 `parentId`。V1 不提供 refs、cross-reference 或 DAG renderer；`parentId` 只服务信息表达与阅读顺序，不承担工作组织语义。

## Node types

| Type | 含义 | 典型内容 |
|---|---|---|
| `goal` | 当前影响方向的预期结果 | “Keep users signed in reliably” |
| `understanding` | Agent 当前采用的事实、综合解释、推断或 hypothesis | “Refresh requests occasionally overlap” |
| `unknown` | 可由调查或证据回答的事实问题 | “Can the race cross workers?” |
| `decision` | 正在权衡的选择或已经作出的承诺 | “Refresh serialization ownership” / “Use server-side idempotency” |
| `option` | Decision 的 considered alternative | “Serialize in the client” |
| `task` | 由当前 working model 导出的行动 | “Trace worker IDs on concurrent refreshes” |
| `drift` | 已检测到的实际方向与 user intent 或现行 map 的偏差 | “The client-only fix assumes a single worker” |

### 关键区分

- `Understanding` 同时覆盖过去讨论中的 Finding 与综合 mental model；自由 `status` 可写 `observed`、`inferred` 或 `hypothesis`。
- `Unknown` 通过发现事实来解决；`Decision` 通过权衡后承诺。Decision title 使用名词短语或结论，不写成疑问句。
- `Option` 只属于 Decision 的方案空间。Unknown 的临时可能答案写成 `Understanding`，状态可用 `hypothesis`。
- blocked work 使用 Task 的 `status: blocked` 与 `note`，不设 Blocker node。
- 长期目标仍使用 Goal，状态写 `long-term`；它只是当前 session 使用的副本，不获得跨 session memory。

## Node shape

```text
Node
├─ id          semantic snake_case, stable, session-unique
├─ type        goal | understanding | unknown | decision | option | task | drift
├─ title       one scannable sentence
├─ status?     short free-form label
├─ note?       optional one- or two-sentence explanation
└─ parentId?   optional display parent
```

约束：

- `id` 在 session 内稳定且唯一，例如 `refresh_race`、`server_idempotency`。
- `status` 是 display annotation，不参与状态机或 compact 筛选；避免重复 icon 已表达的信息。
- `note` 只放支持理解所必需的依据、trade-off 或条件，不充当 scratchpad。
- `parentId` 可自由嵌套，但必须引用现存节点且不能形成 cycle。Option 通常位于相关 Decision 下，这一语义由 Agent guidance 保持，不在 schema 中硬编码。
- 当前实现最多保留 32 个节点，促使 Agent 裁剪已经 resolved、done 或不再影响方向的内容。

## Mutation model

Agent 通过一个 `workmap` tool 维护状态：

- `update`：原子 upsert 完整节点，并可同时 remove 过期节点；
- `view`：读取当前 map；
- `clear`：清空当前 session 的 map。

更新保留已有节点的显示位置，新节点追加到末尾。任何 duplicate ID、missing parent 或 cycle 都会拒绝整次更新，不产生半完成状态。

## Session semantics

每次有效 mutation 都追加完整 snapshot 到 Pi session entries。恢复时从 `getEntries()` 而不是 `getBranch()` 读取最新合法 snapshot，因此：

- 同一 session 内执行 `/tree` 不会回滚 workmap；
- `resume` 恢复整场协作的最新 map；
- interactive fork 把当前内存 snapshot 写入新 session，之后独立演化；
- `new session` 从空 map 开始；
- snapshot 不自动进入 Agent context；extension 会为模型调用注入一份短暂、隐藏的 current-state reminder。

这与普通 branch-local todo 的因果回放不同：workmap 是整场协作当前共同看到的白板，而不是某个历史分支当时拥有的任务列表。
