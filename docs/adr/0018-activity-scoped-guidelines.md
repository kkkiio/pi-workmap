# ADR 0018: guidelines 按 activity 切分

- Status: Accepted（修订 [ADR 0017](0017-set-goal-restate.md) 的 guidelines 分配与词表；取代 [ADR 0015](0015-full-rewrite-set-add-drift-two-layer.md) 的 decision 1 与 7）
- Date: 2026-09-17

## Context

- **per-prompt MUST 只买到触碰频率。** v7 语料 325 次 `restate` 里工具结果报 no-change 的只有 2 次，说明重写几乎总有改动——但改动集中在少数行：一场 156 次写入的 session 中，最顽固的一条 task 存活 101 次、一条已定的 decision 存活 57 次。频率也不稳：750 个 prompt 里只有 36% 出现过 restate。ADR 0015 假定"全量重写自然带来 re-examination"，该假定被证伪。
- **type 条与 schema 重复承载。** 类型语义、标签词表、标题惯例已在 `src/node-types.ts` 的 literal 与字段描述里，且随 tool schema 常驻上下文。
- **调研期没有 update 触发。** 唯一的强时序锚在 prompt 边界，turn 内的新发现与新怀疑没有上板义务。

## Decision

1. **guidelines 由 type 切分改为 activity**：`restate` 只留两条，均不带 MUST——`While investigating: …`（发现写成 understanding；领先怀疑出现、变化或被排除时先上板再继续 probe）与 `While weighing options: …`（选项摆成 decision + option，不要默默拍板）。
2. **删除 per-prompt MUST**，掉旧义务移入 `set` 的参数描述（"restate what still matters and drop the rest"）。`set_goal` 与 `add_drift` 的 MUST 保留。
3. **类型语义与标题惯例搬回 schema**；task 去掉 `done`（结束即删，值得留下的副作用改写成 understanding），understanding 去掉 `assumed`、增加 `ruled out`——未标注的 understanding 即当前未验证的看法，留下的两个值正好是被证据改写的状态。
4. **删除三个 `promptSnippet`**：Pi 只列出提供 snippet 的工具，本次接受"工具仅靠 description 与 schema 出现在 API tools 中"。
5. **context-facing 文本去重、去布局词**：工具 description 不再复述参数契约；删掉 "hoisted below the goal row"、"restrained right-side"——模型操作不了排版。

## Consequences

- `restate` 的 guidelines 由 4 条降到 2 条；陈旧信号的清理改由 `set` 的替换语义承担（观察项见 [open-questions](../open-questions.md)）。
- 旧快照里的 `done` / `assumed` 不受影响（label 是自由字符串），下一次重写自然消失。
- `test/agent-surface.test.ts` 的快照覆盖本次全部文本变更。
