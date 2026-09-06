# ADR 0015: 全量重写、set/add_drift 双工具与两层结构

- Status: Accepted（取代 [ADR 0010](archive/0010-staleness-counter-reinjection.md)、[ADR 0011](archive/0011-nested-children-root-ids.md)、[ADR 0013](archive/0013-full-tree-widget-capacity-eviction.md)、[ADR 0014](archive/0014-guidelines-slimming-type-scoped-status.md)；部分取代 [ADR 0003](0003-no-blocker-node.md) 的 Task · blocked 面包屑通道；goal 节点退役与 longTermGoal 字段另见 [ADR 0017](0017-longtermgoal-field-goal-node-retirement.md)）
- Date: 2026-09-02（2026-09-06 修正：anchor 意图、容量改形与校验分层，见 Decision 3 与 Decision 5）

## Context

增量更新模型（按 root id upsert、remove、整树替换）在真实使用中暴露出两类成本：

1. **寻址负担转化为模型错误。** 部分更新要求模型在上下文里维护"哪些 root 存在、子树当前长什么样"的寻址状态；实际会话中模型反复发出非法调用（nodes 内嵌 remove、超长 title、遗忘 id 格式）。而每 run 全量重注入（ADR 0010）本就意味着模型调 tool 时手里永远有全图——增量寻址没有换来信息增益，只换来了错误面。
2. **staleness 机制在治症状。** MUST 时序 + staleness 计数（ADR 0010）是在用传感器补偿"模型可能不更新"；ADR 0003/0014 之后 guidelines 仍在为陈旧 heading 打补丁。根因是更新模型本身：全量重声明天然消灭陈旧，增量模型才需要陈旧检测。

同时确认的产品语义修正：task 覆盖"打算做 / 正在做 / 已做（含副作用）"，词表为 `pending / active / done`；`blocked` 从未被模型实际使用——被挡时模型本来就当场在对话里问，map 上的 label 冗余于对话。

## Decision

1. **每个 user prompt 全量重写（MUST）**：Agent 在每个 prompt 的首个动作前，用 `workmap` 工具提交完整 map；内容未变时原样重发。全量重写在机制上实现了每条信号的 re-examination，一条 MUST 覆盖全部时序。
2. **`workmap` 工具只剩一个动作 `set`**：参数即完整 map，原子替换；`nodes: []` 清空；缺 `nodes` 键拒绝（防误触清空）。`view` 删除（tool 回声 + 每 run 注入已含全图）。
3. **专用 `add_drift` 工具**：参数只剩 `title`，type 固定 drift、status 自动 `detected`；可在空 map 上使用（drift 可起图，见 Decision 5 的校验分层），总节点超限照拒。工具名即引导：mid-loop 唯一真实的追加场景就是换方案时的 drift。
4. **两层结构**：root + 一层 children；深度 ≤ 2。root 不携带 id；快照删除 `updatedAt`（无驱逐则无树龄）。
5. **校验分层：声明通道的结构约束进 set schema；状态层只做（UI）兜底**。schema 管得住的进 schema；schema 表达不了的（状态依赖、跨节点求和）才由 state 兜底；其余一切语义引导属措辞，永不立法：
   - **schema 层**：节点类型 enum（decision / understanding / option / task / drift）；title 长度 1–120；status 自由字符串 ≤24；roots ≤ 8（`maxItems`）、每 root children ≤ 4（`maxItems`）；深度 2（child 无 children 键，`additionalProperties: false`）；清空 = `nodes: []`。调用边界拒绝，模型自动重试。
   - **兜底层**：总节点 ≤10（跨节点求和，widget 高度契约的极端防护——schema 形状极端组合 8×(1+4)=40 会冲垮它）——set 与 add_drift 共用同一不变量同一数字；违规整次拒绝、永不静默修剪。
   - **措辞层（不是校验）**：status 词表（顺应模型先验重定，如 understanding 的 confirmed/inferred/hypothesis）、decision "…? → 结论" 标题惯例、option 归位 decision 之下——由 schema description 与 guidelines 承载，词漂了调词，永不升格为校验。
   - **anchor 的归宿见 [ADR 0017](0017-longtermgoal-field-goal-node-retirement.md)**：goal 节点类型退役、意图槽位收敛为 `longTermGoal` 可选 scalar 字段——分层原则的一个实例（意图引导属措辞，不立法）。

   本条的裁决标准：新增约束前先问它属于哪一层——是声明结构（进 schema）、UI 不变量（进 state 兜底）？都不是，就是措辞，不许立法。
6. **staleness 传感器以 prompt 为单位回归**：每 run 注入快照携带"距上次 workmap 调用的 prompt 数"，≥2 时 footer 升级为点名提醒。MUST 降低遗忘概率但不能消灭它；计数使遗忘对模型可见。评估过硬机制（`before_provider_request` 强设 `tool_choice`）：payload 为 provider 各异的 opaque 结构，且强逼出的重写没有真实模型注意力，放弃。
7. **task 词表 `pending / active / done`**：pending 是"动手前"的纠偏窗口；done 的 title 记录副作用（改了什么、跑了什么），近期保留在图上作为行为账本。

## Consequences

- `state.ts` 不再有驱逐、树龄、live-signal 特判与 id 正则；session 持久化协议独立为 `session-entry.ts`（线格式 + 读写，结构校验与 ≤10 兜底留在 state）。
- node 类型语义与不变量集中到 `src/node-types.ts`，schema、guidelines 共用一源；status 词表是措辞，随先验调整，不进校验。
- guidelines 随 goal 节点退役重构（ADR 0017）：goal 类型条删除，意图声明并入 `longTermGoal` 字段 description 与 MUST 重写条；MUST add_drift 保留（内含 drift 定义与移除语义）。
- 新的开放问题：**重写遗忘**（rewrite amnesia）——逐轮重写时静默丢信号的风险，由 tool 回显与 stale 计数反压，列入 open-questions 观察项；**long-term intent** 的推断与沿用（谁声明、跨 session 如何预填）同样列入观察。
- widget 高度契约改形：header（longTermGoal）+ ≤8 行 root（每 root 可带 ≤4 行 child），极端高度从 ≤10 行变为 ≤41 行；是否需要 compact/滚动随真实使用观察，ADR 0013 的驱逐问题不在本次重开。
