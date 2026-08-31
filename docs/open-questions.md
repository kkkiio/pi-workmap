# Open Questions

已确定的产品决策以 ADR 形式记录在 [adr/](adr/)；领域术语见 [AGENTS.md](../AGENTS.md) 的 Domain Language。本页只记录仍需通过真实使用验证的问题。

## 仍需通过使用验证

### Agent maintenance reliability

什么变化足以触发一次更新？如果过于频繁，tool 调用和 UI 会变成噪声；如果过少，map 会落后于实际方向。需要用真实长 session 观察 stale node、漏报 Decision 与延迟移除的频率。

### Compact line budget

当前 compact 以 cluster 为单位采样，最多五行、每簇最多三行。需要验证不同终端高度下，行预算与簇预算哪个更合适，以及多个平级 Heading 是否会挤掉关键信号。

### Free-form status vocabulary

自由 status 避免引入不必要状态机，但可能产生 `active / doing / in_progress` 等词汇漂移。先观察 Agent 实际用词，再决定是否只在 prompt 中推荐一组 vocabulary；不要过早把它做成 enum。

### Drift discoverability

Agent 是否能可靠识别自己与 user intent 的真实偏差，而不是只记录抽象风险？需要特别观察用户纠正后，Agent 是否及时新增、解释并清理 Drift。Drift 的参照是对话中声明的意图与现行 map，用户沉默不代表接受；需要观察的是：用户接受后，Agent 是否把结论转为 Decision 或 Understanding 再删除 drift，以及 drift 长期存在时 Agent 是否会主动在对话中确认方向。

### Escalation reliability

硬阻塞依赖 Agent 主动停下来在对话中提问（见 ADR 0003）。需要观察：Agent 遇到没有用户就无法继续的情况时，是停下问，还是只把 Task 标成 `blocked` 继续干别的；以及 blocked 面包屑是否真的指向对话中等待的那个问题。

### ~~State anchor salience~~（已验证，见 ADR 0010）

已观察到预期现象：一次调试会话中 Agent 首个 run 写入 workmap 后跨 3 个 user prompt、~70 次工具调用未更新，唯一的状态消息漂到上下文深处，用户被迫追问"你在干什么"。已按预案反转为每 run 重写并附加 staleness 计数（[ADR 0010](adr/0010-staleness-counter-reinjection.md)）。后续观察项转移为：模型是否对每 run 重复出现的快照产生习惯化（计数增长仍不触发更新）。

### Fork edge cases

交互式 fork 会继承当前内存 snapshot。仍需验证从很早的 tree 节点 fork、从 CLI 直接 fork 与异常退出后的恢复是否都符合“继承当下状态”的用户预期。

### Success criteria

产品是否有效不能只看 workmap 更新次数。更有意义的指标包括：用户发现错误方向所需时间、需要追问“你现在为什么这样做”的次数、长 session 中接管所需时间，以及 map 被用户纠正后 Agent 行为是否真正改变。
