# ADR 0017: set_goal 独立目标通道与 restate 信号声明

- Status: Accepted（修订 ADR 0015 的写入通道、目标约束和反馈；沿用 ADR 0016 的意图语义与展示顺序）
- Date: 2026-09-07

## Context

此前的真实会话与 [ADR 0016](0016-rename-heading-to-goal-drift-prominence.md) 回放显示：goal 容易退化为当轮任务复述。目标和其余信号共用每轮全量重写通道，目标也随每次声明被重写。本次将目标更新与频繁的信号重述分开，保留既定的意图语义、drift 触发条件与类型措辞。

## Decision

- `set_goal({ title, label? })` 是目标的独立写入通道；goal 保存为单一槽位，置顶显示。目标只随意图理解变化或加深而更新。
- `restate({ set })` 每个 user prompt 首个动作前重述完整信号树，原子替换 nodes。`set: []` 清空信号，保留 goal。五种节点类型为 understanding、decision、option、task、drift。
- `add_drift({ title })` 在换方案或开始绕路时立即追加 drift，自动标注 `detected`；可在空图上使用。保留本次定稿的完整 MUST 触发与消解措辞。
- 字段使用 `label` 表达自由标注，长度最多 24；推荐词表为 decision considering/chosen、understanding confirmed/assumed、task pending/active/done。词表、option 归位和标题惯例均属于措辞，不作语义校验。
- 结构为 root 加一层 children，title 长度 1–120；总容量为 10 个信号，包含 goal 与 children。根节点和子节点不另设数量上限。所有写入与恢复检查同一完整状态，超限整次拒绝。
- 六条已定稿 guidelines 按工具归属注册：`restate` 承载重述时序、decision/option、understanding、task 四条；`set_goal` 承载目标提炼一条；`add_drift` 承载偏差报告与消解一条。原文在 `src/index.ts` 的对应工具注册处，沿用本次定稿，不另加总纲。
- 每个 agent run 仍通过 `before_agent_start` 注入持久化隐藏状态消息，遵循 [ADR 0004](0004-context-injection.md) 的缓存与历史约束。消息只含当前 goal 与树，删除底部重复命令和 stale 计数。成功工具结果只给更新摘要，完整状态由 widget 和展开结果展示。

## Persistence

快照 v7 保存 `{ version, goal?, nodes }`。v4–v6 在恢复边界迁移：v4 的 heading 视为 goal，第一个 goal 根节点提取为独立槽位，其余 goal 根节点不再保留；status 改为 label。当前版本直接校验。无效快照回退到上一份有效状态。

## Consequences

目标跨信号重述保持稳定；尚未提炼目标时 goal 行缺席。独立通道对目标质量与写入时机的实际效果继续在 [open-questions](../open-questions.md) 观察。

每次成功写入的状态必须可原样恢复；goal、新增 drift、信号重述共享完整状态容量检查。测试覆盖工具调用到持久化恢复的完整过程。
