# ADR 0014: guidelines 瘦身与 status 按类型归位

- Status: Superseded by [ADR 0015](0015-full-rewrite-set-add-drift-two-layer.md)（guidelines 随全量重写重构；status 按类型归位的原词典为 node-types.ts 承接）
- Date: 2026-09-01

## Context

promptGuidelines 从 7 条增长而来，review 中暴露三类问题：

1. **说教条目无效。** "Proactively update…" 这类泛化主动性要求，是模型最不理的句式；而它的具体时序要求（mid-loop 更新、结尾补写=事后总结）在注入快照页脚已处于更强位置（ADR 0010 的尾部锚定）。
2. **重复承载。** 边界定性（"not a history/todo"）、寻址模型（root id / 整树替换）、事实问题不上图，三者的语义已分别由 evict 机制、tool schema 字段描述、与对话纪律承载，guidelines 里的成段重述没有增量。
3. **status 词表与类型割裂。** 扁平词表（current、long-term、open、investigating、…）横跨所有类型，但词汇实际是类型私有的——considering/chosen 只属于 Decision，active/blocked/done 只属于 Task。模型需要自己拼合"类型 × 可用 status"，拼合错误没有护栏。

同时确认：`"?→ 结论"` 的 Decision 标题惯例保留；Decision 不改名（"Question" 只命名生命周期的一半，见会话讨论记录）。

## Decision

1. **guidelines 7 条 → 6 条**：删除边界定性、事实问题不上图、寻址模型三条；主动性条删去泛化首句，保留 MUST heading 时序；"keep updating mid-loop" 拆成独立的**全信号**时序条（You SHOULD），不再从属于 heading。
2. **类型条按 decision → option → understanding → task → drift 排序**，与上一条 "routes are decisions" 的指称衔接；各类型的 status 词表内联进该类型的从句，扁平 status 词表条删除。
3. **status 字面值不加粗**：注意力按后果分配——MUST/SHOULD 占住最高层，status 是代价最低的字段；为未被观察到的失败模式（乱用 status）支付显著性预算，违背 ADR 0011 确立的"机制只为真实失败而设"纪律。若实践中出现 status 词汇漂移，加粗是第一顺位的便宜修法。

## Consequences

- 各类型条目自包含：模型读一条即得到类型语义 + 该类型的合法 status 示例。
- "Prefer restrained conventional labels" 总纲随扁平词表删除，由各类型的例词 embody；若需要自由 label 的许可，需要后续补一句。
- heading 的 status 句独立收尾（"A heading takes status current or long-term."），避免尾挂括号被误读为修饰 "decisions"。
