# ADR 0004: workmap 状态注入的通道与频率（待定）

- Status: Proposed
- Date: 2026-08-30

## Context

Workmap 的内容需要持续到达模型。当前实现是 `pi.on("context")` 的 **ephemeral 注入**：每次 LLM 请求前，把 `<workmap-state>` user 消息现场追加到消息列表尾部，只用于这一次请求，不写入 transcript。这个选择来自初始实现，未经评估——`context` 是 pi 里做这件事的惯用钩子，当时缓存语义不在考量维度内。

后经查证，注入设计的价格高度依赖 **provider 私有的缓存语义**，三个轴各不相同：

| 轴 | 取值 |
|---|---|
| 匹配粒度 | 任意字节前缀（Anthropic / OpenAI 自动缓存） vs 完整"缓存前缀单元"匹配（DeepSeek，受 SWA 影响） |
| 落盘范围 | 只缓存输入前缀（OpenAI 托管） vs 模型输出结束位置也落盘（DeepSeek） |
| 会话状态 | 无态重建（pi 两条 API 路径均 `store: false`，不用 `previous_response_id`） vs 服务器侧链式复用 |

关键事实：

- **DeepSeek 单元匹配**下，vanilla agent loop 是链式命中的（每个请求完整匹配上一请求的输出端单元）。turn 内任何 ephemeral 中间态都会断链：请求 1 的单元以 reminder 结尾，请求 2 在该位置是分叉的 assistant 消息，完整匹配失败，退化到公共前缀/间隔单元的粗粒度命中。
- **Anthropic** 的 `cache_control` 断点打在"最后一条且为 user 角色"的消息上；我们的 reminder 恰好满足，附带充当了 tool 循环中的缓存写入锚点（没有它，末尾是 toolResult 的请求不写历史缓存）。
- **思考回传**：DeepSeek 在携带 `tools` 时强制回传全部历史 `reasoning_content`，否则 400；Anthropic 按签名回传。compaction 或历史裁剪不能剥离 thinking 块（对 DeepSeek 路径而言）。
- **oh-my-pi 对照**：其 mode/todo 上下文用持久化隐藏消息（`display: false` 进 transcript）注入，买到"一次注入、整 turn 可见"和完整缓存链，代价是对话记录混入系统消息——通过 customType 分类与 history 格式化规则管理。

## 候选方案

### A. ephemeral 门控（每 agent run 一次）

`before_agent_start` 武装 flag，首次 `context` 事件注入后消费；`session_before_compact` 重新武装。turn 内后续请求不带 reminder。

- 优点：DeepSeek 链式命中恢复；token 与重复噪声最低；transcript 零污染。
- 缺点：turn 内请求 2..N 看不到 map（缓解：变化来自 Agent 自己的 tool 调用；`view` action 兜底）；失去 Anthropic 上 reminder 附带的断点锚点。

### B. A + mutation 后补注

`workmap update` 实际变更后重新武装 flag，下一个请求注入新状态。

- 优点：保留"改动后紧反馈"。
- 缺点：DeepSeek 语义下每次 mutation 都断链，价值大打折扣；复杂度增加。

### C. 现状：每请求 ephemeral 注入

- 优点：任何时刻模型看到最新 map；对 compaction 天然免疫；Anthropic 上附带断点锚点。
- 缺点：DeepSeek 上打断 turn 内链式命中（成本是整段增量的重算，远大于 reminder 本身）；重复提醒的习惯化噪声。

### D. persisted 注入（`sendMessage(display: false)`）

每 turn 开头把 workmap 状态写为持久隐藏 custom message，复刻 oh-my-pi 语义。

- 优点：一次注入整 turn 可见；DeepSeek 链式命中完整；Anthropic/OpenAI 上注入内容算一次后白嫖；pi 原生支持（custom message + `registerMessageRenderer` 可渲染为淡色提示行）。
- 缺点：transcript 混入系统消息，违背当前"不污染对话记录"的取向；compaction 会把注入内容压掉，需要重建机制；history 导出/分享时需考虑过滤。

## 无论选哪个都已确定的原则

- 注入内容只出现在消息列表**尾部**或作为独立持久消息，绝不改动历史字节。
- 易变状态不进 system prompt（前缀缓存的最大敌人）。
- 空 map 时零注入、零开销。
- `view` action 保留为模型主动查询全量状态的逃生舱。

## Decision

**待定**，在 A 与 D 之间选择。选择标准是真实使用中的对齐效果与缓存实测（DeepSeek 的 `usage.prompt_cache_hit_tokens` 可直接测量各方案的命中差异）。B 与 C 记录为已评估的备选：B 在单元匹配语义下价值不足，C 是被否定的现状。

## Consequences

- 本 ADR 记录前，"ephemeral 每请求注入"是未评估的初始实现；本 ADR 之后，任何注入通道/频率的变更都应对照上表更新。
- 若选 A：实现成本低（flag 门控 + `session_before_compact`），turn 内可见性损失靠 `view` 兜底。
- 若选 D：需要设计持久消息的生命周期（何时写、何时被视为过期、compaction 后如何重建），以及 renderer 与导出过滤。
