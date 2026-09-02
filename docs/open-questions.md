# Open Questions

已确定的产品决策以 ADR 形式记录在 [adr/](adr/)；领域术语见 [AGENTS.md](../AGENTS.md) 的 Domain Language。本页只记录仍需通过真实使用验证的问题。

## 仍需通过使用验证

### Rewrite fidelity（重写保真）

全量重写给了模型每轮静默丢信号的机会：改写中缩短 title、丢掉 child、或整棵丢弃仍然相关的树。需要观察：被丢的信号多久被用户或 tool 回显发现；重写质量是否随 session 变长衰减；重写是否沦为机械复读（内容长期不变也不重审 heading）。

### Stale counter effectiveness

注入 footer 的 prompt 计数与 ≥2 时的点名升级，是否真能把遗忘的重写拉回来？需要观察模型对重复出现的快照是否习惯化（计数增长仍不触发 set），以及升级文案触发后首个动作是否就是 workmap 调用。

### add_drift adoption

add_drift 是否真的被用在设计场景——换方案或绕路的瞬间？还是被当作通用 mid-loop 更新（如果发生，观察追加内容的类型分布与质量），或干脆从不使用？空 map 与满容量拒绝的出现频率也是信号：频繁的满容量拒绝说明 10 节点对实际工作太紧。

### Drift discoverability

Agent 能否可靠识别自己与 user intent 的真实偏差，而不是只记录抽象风险？用户纠正后，Agent 是否及时新增、解释并清理 drift；drift 的参照是对话中声明的意图与现行 map，用户沉默不代表接受；drift 长期存在时 Agent 是否会主动在对话中确认方向。

### Fork edge cases

交互式 fork 会继承当前内存 snapshot。仍需验证从很早的 tree 节点 fork、从 CLI 直接 fork 与异常退出后的恢复是否都符合"继承当下状态"的用户预期。

### Success criteria

产品是否有效不能只看 workmap 调用次数。更有意义的指标包括：用户发现错误方向所需时间、需要追问"你现在为什么这样做"的次数、长 session 中接管所需时间，以及 map 被用户纠正后 Agent 行为是否真正改变。
