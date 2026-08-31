# ADR 0006: context 注入快照剔除 note

- Status: Accepted
- Date: 2026-08-31

## Context

Extension 在每次 agent run 前向模型注入 `<workmap-state>` 快照（通道与频率见 ADR 0004）。快照最初包含 note 全文。note 上限 280 字符，是快照里最贵的字段——32 节点写满时单条快照接近 10KB，而快照随每次实质变更累积进历史。

note 的设计受益者是**扫读 widget 的用户**（`docs/ui.md`：note 只解释必要证据、条件或 trade-off）。模型不是 note 的受益者：它记得自己写下 note 时的推理。

## Decision

注入快照只含结构与标题（id、type、status、层级），剔除 note。note 保留在持久化 state 与 expanded widget 中，继续服务用户扫读。

## Rationale

**谁受益谁承担。** 注入快照的职责是让模型保持地图的结构性连续，不是替 compaction 保存推理过程——重要信息在 compaction 摘要中幸存是 compaction 自身的职责。剔除 note 后快照体积约减半，同时消除了"note 写了两份读者"的定位模糊。

被否决的替代方案：保留 note 以防 compaction 后模型遗忘决策理由。否决理由：compaction 不频繁，且压缩摘要本就应保留关键结论；为它长期支付每条的 note 成本不划算。

## Consequences

- `src/context-message.ts` 不再渲染 note 行。
- compaction 后模型只能看到决策结论而非理由；若实践中出现"重开已拍板决策"的症状，再评估是否恢复。
