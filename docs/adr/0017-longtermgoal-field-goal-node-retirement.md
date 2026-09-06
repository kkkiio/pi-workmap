# ADR 0017: goal 节点退役，意图槽位收敛为 longTermGoal 字段

- Status: Accepted（废止 [ADR 0008](archive/0008-rename-goal-to-heading.md)、[ADR 0009](archive/0009-heading-first-ordering.md)、[ADR 0016](archive/0016-rename-heading-to-goal-drift-prominence.md)；修正 [ADR 0015](0015-full-rewrite-set-add-drift-two-layer.md) 的 anchor 条款为指针）
- Date: 2026-09-06

## Context

三条证据链指向同一结论：goal 节点不是信号，是伪装成信号的 task 复述。

1. **LLM 系统性把 task 写进 goal。** session 数据里 goal 行长这样："Implement ADR 0013 hub REST command transport without regressing legacy WS or existing SSE"（且带 `active` 状态）——它就是对当前请求的复述。ADR 0016 的 ablation 两臂均"只停留在当轮请求的近目标"；open-questions 的原话："goal 命名 + 意图级 guideline 改善了锚的稳定性与加深，但没有解决"。
2. **为治理它付出的机制成本持续增长。** 三次产品尝试（heading→goal 改名、意图级 guideline、falsifiable paraphrase 框架）均未把模型从复述拉到意图；goal 的 status 误用（done 17 次、active 16 次、ADR 0016 记录的 goal|active 复发）催生了专门的观察条款——一个被系统性填错的字段在持续吸收校验与 ADR 预算。
3. **长期意图无处安放。** `long-term` status 全库仅 2 次；LLM 不会主动推断长期意图（open-questions 记录），根因是 schema 里没有这个槽位——status 自由字符串不构成 affordance，模型不知道"长期"是个可选项。

对齐职能重新归位后不缺位：模型在做什么由 task 状态可见，为什么这样做由 decision/understanding 可见，方向偏了由 drift 可见——**用户看图并纠正，本来就是 workmap 的对齐机制**；goal 那行 task 复述在该链条里没有承担任何一环。

## Decision

1. **goal 节点类型退役**：节点类型词表 6→5（decision / understanding / option / task / drift）；goal 的 ✦ glyph 移交 map header。
2. **`set` 参数新增 `longTermGoal` 可选 scalar 字段**：长期方向（standing project-level intent）的唯一槽位。保持可选——required 制造伪造义务，会把刚退役的假锚精确复刻进字段（required 下模型每轮被迫编一个"长期意图"，填充物仍是 task 包装）；strict 下可选属性自动 nullable + required，字段每轮呈现，affordance 由序列化保证而非逼供。空着是诚实状态。
3. **职责分离**：会话内"在做什么/为什么"由 5 类节点承载；`longTermGoal` 只承载用户声明过（或模型推断、用户可纠正）的长期方向。推断到了可以填，用户纠正必须改。不设会话级 goal 字段——那正是被证据否决的假锚。
4. **渲染**：`longTermGoal` 呈现为 map header（✦ + accent），不是树行；树从 header 下开始。present 时才渲染。
5. **快照 v6 迁移**：goal 节点直接丢弃（task 复述无保留价值）；带 `long-term` 标注的 goal（全库 2 例）迁入 `longTermGoal` 字段。
6. **跨 session 持久化不在本次范围**：字段先为 per-session；从项目文档预填、跨 session 沿用列入 open-questions。

## Consequences

- 校验随 [ADR 0015](0015-full-rewrite-set-add-drift-two-layer.md) 的分层归位：节点 enum 5 值、无 goal 相关的任何 schema 约束；`longTermGoal` 是 scalar，strict 子集全兼容（无 anyOf 数组变体、无 contains）。
- goal 的 status 误用类（goal|done / goal|active / goal|considering）随节点消失，不new新治理机制。
- guidelines 重构：goal 类型条删除；意图声明引导并入 `longTermGoal` 字段 description（in-context 教学免费搭 prompt cache）与 MUST 重写条。
- widget 契约：header（longTermGoal，present 时）+ ≤8 root（各 ≤4 children）；总节点 ≤10 兜底继续只计节点（roots+children），header 行不计。
- 开放问题：long-term intent 的推断质量（字段 affordance 是否真能引导模型，还是只能等用户声明）；跨 session 的声明主体与预填来源。
