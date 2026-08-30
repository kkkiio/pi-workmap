# Open Questions

## 已确定的产品选择

- Workmap 由 LLM Agent 主动维护，human 通过对话检查和纠正。
- 一个 session 可有多个平级 Goal；Goal 不强制组织其他节点，也不增加 Workstream。
- V1 使用 single-parent tree，不提供 refs、cross-reference 或 DAG UI。
- Node types 是 Goal、Understanding、Unknown、Decision、Option、Task 与 Drift。
- Finding 并入 Understanding；Blocker 并入 Task status/note；LongTermGoal 表示为 `Goal · long-term`。
- Option 是 Decision 的 considered alternative；Unknown 的临时答案写作 `Understanding · hypothesis`。
- 同一 session 的 `/tree` 分支共享最新状态；resume 恢复，fork 继承后独立，新 session 为空。
- widget 常驻且 display-only，复用 Pi 官方 `Ctrl+O` compact / expanded 状态。

## 仍需通过使用验证

### Agent maintenance reliability

什么变化足以触发一次更新？如果过于频繁，tool 调用和 UI 会变成噪声；如果过少，map 会落后于实际方向。需要用真实长 session 观察 stale node、漏报 Decision 与延迟移除的频率。

### Compact line budget

当前最多展示五个 node，并按 alignment value 排序。需要验证不同终端高度下，四行、五行或动态预算哪个更合适，以及多个 Goal 是否会挤掉关键 Unknown。

### Free-form status vocabulary

自由 status 避免引入不必要状态机，但可能产生 `active / doing / in_progress` 等词汇漂移。先观察 Agent 实际用词，再决定是否只在 prompt 中推荐一组 vocabulary；不要过早把它做成 enum。

### Drift discoverability

Agent 是否能可靠识别自己与 user intent 的真实偏差，而不是只记录抽象风险？需要特别观察用户纠正后，Agent 是否及时新增、解释并清理 Drift。

### Fork edge cases

交互式 fork 会继承当前内存 snapshot。仍需验证从很早的 tree 节点 fork、从 CLI 直接 fork 与异常退出后的恢复是否都符合“继承当下状态”的用户预期。

### Success criteria

产品是否有效不能只看 workmap 更新次数。更有意义的指标包括：用户发现错误方向所需时间、需要追问“你现在为什么这样做”的次数、长 session 中接管所需时间，以及 map 被用户纠正后 Agent 行为是否真正改变。
