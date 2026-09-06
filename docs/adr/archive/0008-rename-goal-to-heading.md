# ADR 0008: Goal 更名为 Heading

- Status: Accepted
- Date: 2026-08-31

## Context

在一场长 session 的实使用中，Agent 从未写入任何 goal 节点。复盘发现词汇本身是路由障碍："goal"自带稳定、宏大、结果级的庄重感，面对"当前阶段该做什么"这种信息时，Agent 下意识觉得小题大做而不写。

更深一层：这个类型的功能被确认为 **Agent 对用户意图的当前报告——价值在于可证伪**（用户的陈述 ≠ Agent 的理解，缝隙正是 workmap 的存在前提）。进一步的行为观察显示，LLM Agent 有暴露厌恶倾向：不承诺的姿态永远不会被判错，所以揣测用户意图这类高方差信息会被本能地推迟到"有信心再写"。

## Decision

节点类型 `goal` 更名为 `heading`（中间态 `direction` 同日被覆盖，未发布）。定义：Agent 对用户意图的当前最佳解读，是全图的锚。核心框架：**报告 heading 是遥测，不是证词**——被纠正的 heading 是成功事件而非错误，因此低把握也应早声明。只命名目的地，不命名路线（路线是 Decision）。glyph 维持 ◎。

恢复旧 session 快照时，遗留 `goal` / `direction` 节点迁移为 `heading`。

Guidance 同步强化更新纪律：每次相位切换与每次被用户纠正后重新审视 heading；**理解变了就更新，即使用户的原话没变**。

## Rationale

**类型名是 Agent 路由行为的主要杠杆。** ADR 0005 用路由实践判据删除了一个类型；本条用同一判据改名另一个。"goal"的庄重感抑制写入与更新；"direction"减轻了宣称感但仍是断言；"heading"自带"持续被修正"的导航语义——航向报告是日常仪表读数，调整航向不构成过失，恰好内置了对抗暴露厌恶所需的框架。它与 drift（偏航）构成同一词族，类型系统因此讲一个连贯的航海故事。

## Consequences

- 恢复迁移与 ADR 0005 的 unknown 迁移共用同一通道。
- heading 与 decision 的边界由 guidance 维持：目的地 vs 路线。
- ADR 0001–0003 中的 goal 字样为历史记录，不回改。
