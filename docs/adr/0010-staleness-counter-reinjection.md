# ADR 0010: 反转为每 run 重注 + staleness 计数

- Status: Accepted（修订 [ADR 0004](0004-context-injection.md) 的"去重的取舍"一节）
- Date: 2026-08-31

## Context

ADR 0004 选择 persisted 注入时按内容去重（"内容未变时不重复写"），并把去重的代价明确列为观察项（[open-questions](../open-questions.md) 的 State anchor salience）：map 长期不变时，唯一的状态消息会停在越来越久远的位置，长上下文中显著性下降，模型可能因此忘记维护 map。

该观察项现获得真实使用证据。一次 pi-advisor 调试会话中，Agent 在首个 run 写入 workmap（2 条节点、无 heading）后，跨 3 个 user prompt、约 50 分钟、~70 次工具调用未再更新；唯一的状态消息被埋在数十次工具输出之后，用户最终被迫在对话中追问"你先说清楚你在干什么"。横向统计近期 8 个会话：5 个会话全程 0 次 workmap 调用；唯一高频使用的会话恰是 workmap 本身作为主线任务的会话——问题是注意力竞争，不是能力或工具可用性。

同时经 pi 源码查证：tool result 的 `details` 不进入 LLM 上下文，模型本就只看到一行结果摘要；快照消息是 map 到达模型的唯一通道，其位置衰减即 map 的衰减。

## Decision

1. **反转去重**：每个 agent run（`before_agent_start`）都重新注入 `<workmap-state>` 快照，删除 fingerprint 去重标记与 `session_before_compact` 的重置特判。
2. **快照尾部附精确计数**：`Last workmap update: N turns ago.`，N 为自上次 workmap 调用以来的 agent turn 数（`turn_end` 事件，跨 run 累计）。任何 workmap 调用——包括 no-change 的再断言——将计数复位为 0。
3. **不加劝说性文案**：常设指令已在快照页脚（"Keep it concise and current…"），staleness 只提供客观数字，由模型自行判断。这延续 workmap "state anchor, not conversation to react to" 的定位，不引入 nag 消息。
4. **空 map 维持零注入**（ADR 0004 原则保留）：有 nodes 但停滞才是观测到的病灶；空态沉默不是。

## Rationale

每 run 重注把锚点固定在消息列表尾部的近因窗口，直接对治位置衰减——这是去重设计自身预留的反转条件。注入粒度是 user prompt 而非 LLM turn，成本有界（每 prompt 一条百余 token 的小消息）；ADR 0004 的缓存语义表依然成立：注入位置、持久通道与 DeepSeek 链式命中均不变，只是同一消息的出现频率从"变化时"变为"每 run"。

精确计数优于分档文案：分档（档内文案固定）是为了保住去重才去量化信息；去重既已反转，就没有理由不向模型提供准确数字。

被否决的替代方案：

- **保留去重 + 分档 staleness**：仍会让锚点在档内漂远，且跨档才注入一条新消息，压力最弱。
- **run 中途注入（`turn_end` / `before_provider_request`）**：能覆盖单 run 内长工具链的盲区，但改动注入通道与时机，成本与风险高；先以每 run 重注验证，不足再评估。

## Consequences

- transcript 中每个 run 出现一条快照；map 不变时相邻副本仅计数不同，session 文件随 run 数线性增长（量级可忽略）。
- `src/index.ts` 移除 `lastInjectedState` 及其全部重置逻辑；`src/context-message.ts` 的 `renderStateMessage` 接受可选 meta 参数。
- 若真实使用中观察到模型对重复快照习惯化（计数增长仍不触发更新），再评估 run 中途注入或 compaction-aware 抑制。
