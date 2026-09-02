# ADR 0015: 全量重写、set/add_drift 双工具与两层结构

- Status: Accepted（取代 [ADR 0010](0010-staleness-counter-reinjection.md)、[ADR 0011](0011-nested-children-root-ids.md)、[ADR 0013](0013-full-tree-widget-capacity-eviction.md)、[ADR 0014](0014-guidelines-slimming-type-scoped-status.md)；部分取代 [ADR 0003](0003-no-blocker-node.md) 的 Task · blocked 面包屑通道）
- Date: 2026-09-02

## Context

增量更新模型（按 root id upsert、remove、整树替换）在真实使用中暴露出两类成本：

1. **寻址负担转化为模型错误。** 部分更新要求模型在上下文里维护"哪些 root 存在、子树当前长什么样"的寻址状态；实际会话中模型反复发出非法调用（nodes 内嵌 remove、超长 title、遗忘 id 格式）。而每 run 全量重注入（ADR 0010）本就意味着模型调 tool 时手里永远有全图——增量寻址没有换来信息增益，只换来了错误面。
2. **staleness 机制在治症状。** MUST 时序 + staleness 计数（ADR 0010）是在用传感器补偿"模型可能不更新"；ADR 0003/0014 之后 guidelines 仍在为陈旧 heading 打补丁。根因是更新模型本身：全量重声明天然消灭陈旧，增量模型才需要陈旧检测。

同时确认的产品语义修正：task 覆盖"打算做 / 正在做 / 已做（含副作用）"，词表为 `pending / active / done`；`blocked` 从未被模型实际使用——被挡时模型本来就当场在对话里问，map 上的 label 冗余于对话。

## Decision

1. **每个 user prompt 全量重写（MUST）**：Agent 在每个 prompt 的首个动作前，用 `workmap` 工具提交完整 map；内容未变时原样重发。全量重写在机制上实现了 heading 的 re-examination，一条 MUST 覆盖全部时序。
2. **`workmap` 工具只剩一个动作 `set`**：参数即完整 map，原子替换；`set: []` 清空；缺 `set` 键拒绝（防误触清空）。`view` 删除（tool 回声 + 每 run 注入已含全图）。
3. **专用 `add_drift` 工具**：参数只剩 `title`，type 固定 drift、status 自动 `detected`；空 map 拒绝（非空 map 必须有双 heading），容量照拒。工具名即引导：mid-loop 唯一真实的追加场景就是换方案时的 drift。
4. **两层结构**：root + 一层 children；`MAX_WORKMAP_DEPTH = 2`。root 不携带 id；快照 v4 删除 `updatedAt`（无驱逐则无树龄）。
5. **容量与 heading 走校验拒绝**：10 节点（含 children 递归计数，widget 高度契约不变）与非空 map 双 heading（≥1 current + ≥1 long-term）由 state 校验强制；违规整次拒绝，永不静默修剪。MUST 从 prompt 收编进代码。
6. **staleness 传感器以 prompt 为单位回归**：每 run 注入快照携带"距上次 workmap 调用的 prompt 数"，≥2 时 footer 升级为点名提醒。MUST 降低遗忘概率但不能消灭它；计数使遗忘对模型可见。评估过硬机制（`before_provider_request` 强设 `tool_choice`）：payload 为 provider 各异的 opaque 结构，且强逼出的重写没有真实模型注意力，放弃。
7. **task 词表 `pending / active / done`**：pending 是"动手前"的纠偏窗口；done 的 title 记录副作用（改了什么、跑了什么），近期保留在图上作为行为账本。

## Consequences

- `state.ts` 不再有驱逐、树龄、live-signal 特判与 id 正则；session 持久化协议独立为 `session-entry.ts`（线格式 + 读写，语义校验留在 state）。
- node 类型语义、status 词表与不变量集中到 `src/node-types.ts`，schema、guidelines、校验共用一源。
- guidelines 回到七条：MUST 重写、heading 语义、SHOULD mid-loop add_drift、decision、understanding、task、drift（定义 + 移除语义）。
- 新的开放问题：**重写遗忘**（rewrite amnesia）——逐轮重写时静默丢信号的风险，由 tool 回显与 stale 计数反压，列入 open-questions 观察项。
- widget 高度契约不变（header + ≤10 行）；渲染改为两层扁平遍历。
