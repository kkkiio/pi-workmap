# ADR 0017: goal 独立写入通道——set_goal 工具

- Status: Accepted（修订 [ADR 0015](0015-full-rewrite-set-add-drift-two-layer.md) 的 schema 层字段清单与 guidelines；继承 [ADR 0008](0008-rename-goal-to-heading.md) 的 goal 语义与 [ADR 0009](0009-heading-first-ordering.md) 的渲染优先级）
- Date: 2026-09-06

## Context

假锚的病根不是模型不会写 goal，而是 **goal 与 signals 共用一个写入通道**：每轮 MUST 全量重写都携带 goal，模型每轮被迫重新"陈述意图"，而它手上只有当前请求——于是 goal 每轮被重写成 task 复述。session 数据的病灶（goal|done 17 次、goal|active 16 次；ADR 0016 ablation 停留在近目标）都是这一个通道问题的症状。措辞引导与校验都治不到病根：通道本身在制造污染。

`add_drift` 已经验证了相反的手法：给意图一个专用工具，工具名即引导，写入时机与内容随之归位。goal 需要同款。

## Decision

1. **goal 移出 `set` 的节点列表**：`workmap set` 的类型 enum 剩 5 类（understanding / decision / option / task / drift）；goal 是 state 级独立槽位，**唯一写入者是 `set_goal`**（双写必打架，不留）。
2. **`set_goal` 参数**：`{ title: string(1–120), status?: string(≤24) }`——与 goal 节点形状一致（保留 long-term 标注能力，ADR 0008 血统不断）；纯 properties，strict 子集全兼容。
3. **渲染**：goal 是 map header（✦ + accent），不是树行；drift 悬挂其下（回归 ADR 0016 的表述）；快照 v7 = `{ goal?, nodes }`，v6→v7 迁移把 goal 根节点提取为 header 字段。
4. **MUST 全量重写的范围相应收窄**：每轮重写 signals（不含 goal）；goal 由 `set_goal` 在意图形成/深化时写入。
5. **容量**：roots ≤ 8、children ≤ 4 与总节点 ≤10 兜底只计 nodes；header 不计。`set: []` 清 signals 不清 goal（独立槽位）。
6. **无机械保证模型何时 `set_goal`**——guideline 引导 + 无 goal 时 header 缺席可见。观察，不立法（ADR 0015 的措辞层纪律）。

### Guidelines（定稿措辞）

1. You MUST re-declare the complete signal map via the `workmap` tool before your first action after every user prompt; an empty nodes array clears the map.
2. You MUST distill the user's ultimate want into the goal via `set_goal` before acting on a new or changed request — the destination, never the route; update it only when your reading of their intent deepens or the user corrects direction; it renders as the map header and outlives signal rewrites.
3. You MUST add drift via `add_drift` the moment you change course or start working around a problem mid-task — for a mismatch with the declared plan. When the mismatch resolves, record any lasting conclusion as a decision or understanding, then drop the drift in your next rewrite.
4. Use decision for deliberation or commitments: title it as a question while deliberating, and once decided append the conclusion, e.g. 'Where should X live? → on the server', keeping the question for context; label considering while open, chosen once settled.
5. Use option only for considered alternatives under their decision.
6. Use understanding for current facts, syntheses, and hypotheses; label marks verification level — confirmed/inferred for established ground, hypothesis for an unverified premise. Counterintuitive findings belong here precisely because they are easy to lose.
7. Use task for actions you intend, are doing, or have done; label pending, active, or done. A done title records side effects — what changed, what ran.

动词选择：**distill，不是 guess**。观测到的失败是"够不着"（从字面复制请求），不是"猜太满"——distill 断言终极意图已在用户的话里、指向挖掘；guess 给偷懒许可（浅猜也算完成，不确定时干脆跳过）。可证伪性不需要动词承载：reading 可能错，由产品结构的纠正通道兜底（"best present reading — a falsifiable paraphrase"）。若出现"假装蒸馏"（编造用户没说的意图）这一新失败模式，第一顺位修法是 description 加 "grounded in what the user actually said"，不是换动词。

## Consequences

- 近目标污染的通道关闭；意图写入成为显式的一步（distill），与 concept.md 的蒸馏图对齐。
- 双写冲突不存在（唯一写者）；goal 跨全量重写稳定，只有 `set_goal` 改变它。
- 快照 v7；widget 契约：header + ≤8 root（各 ≤4 children），总节点 ≤10 兜底（计 nodes）。
- 开放问题：模型主动 `set_goal` 的时机质量（是否等得到蒸馏，还是又退回近目标复述）——header 缺席与 title 措辞是可见信号。
