# ADR 0005: 移除 Unknown 节点类型

- Status: Accepted
- Date: 2026-08-31

## Context

Unknown 的原始定位是"可由调查或证据回答的事实问题"。但一次长 session 的实使用暴露了它与实践的脱节：维护了一整场 20+ 节点的 workmap，Unknown 出现零次。所有"还不知道的事"自然路由到了别处——便宜的问题被直接调查，只有用户能答的在对话里问，挡住选择的栖身于 considering Decision。同期采纳的 Decision 标题生命周期规则（斟酌中可写成疑问句）进一步模糊了 Unknown 与 Decision 的边界。

## Decision

删除 `unknown` 节点类型。事实问题分流到三条已有通道：

- **能查的** → 直接调查，不上板；
- **只有用户能答的** → 对话中问，与 ADR 0003 的"硬阻塞走对话"一致；
- **待验证的猜测** → `Understanding · hypothesis`；挡住选择的写进该 considering Decision 的 `note`。

恢复旧 session 快照时，遗留 `unknown` 节点迁移为 `understanding`，id 与层级保持不变。

## Rationale

类型存废的判据是**路由实践，不是概念纯度**。"靠证据解决 vs 靠拍板解决"的区分在理论上干净，但 Agent 的实际路由习惯才是类型的真实生命力：一个永远被绕开的类型只贡献词汇表复杂度。每增加一个类型都要付出 glyph、色彩语义与 Agent 分类准确率的成本（ADR 0003 同一论据）。删除后六个类型的职责互不重叠。

## Consequences

- 节点类型变为六个：goal / understanding / decision / option / task / drift。
- 旧 session 数据可读：`unknown` 在 restore 时迁移为 `understanding`（见 `src/state.ts`）。
- ADR 0001–0003 中的 Unknown 字样为历史记录，不回改。
