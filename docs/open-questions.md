# Open Questions

已确定的产品决策以 ADR 形式记录在 [adr/](adr/)；领域术语见 [AGENTS.md](../AGENTS.md) 的 Domain Language。本页只记录仍需通过真实使用验证的问题。

## 仍需通过使用验证

### Corpus baseline（改动前的 v7 语料）

本地 15 场 v7 session 的聚合量，作为后续对比的基线：750 个 prompt 中 36% 出现过 `restate`、7% 出现 ≥2 次（最多 4 次）；拒绝写入 36 条（legacy heading 34、容量 2、schema 违规 0）；label 漂移集中在 goal（92 次带 label，24 次不在词表内，其中 22 次是把描述里的 `standing` 当成了取值）。

- activity 条是否真的让 turn 内动起来：重测 ≥2 次的比例（基线 7%）。
- 容量上限是否太紧：暂无证据（容量拒绝仅 2 次）。
- 描述里出现的词会被当成取值建议——候选值只给一个例子。

### Stale signals（陈旧信号）

真实 session 里重写几乎每次都有改动（v7 语料 325 次 `restate` 中，工具结果报 no-change 的只有 2 次），但改动集中在少数行：一场 156 次写入的实现型 session 中，最顽固的一条 task 存活 101 次、一条已定的 decision 存活 57 次、多个已完成行存活 17–21 次。删掉 per-prompt MUST 与 `done` 之后需要观察：陈旧行是否更久不被清理（重写频率下降）、`ruled out` 是否真的被用来收口被排除的分支、以及实施期 map 是否退化成只剩 goal。

### Rewrite fidelity（重写保真）

全量重写给了模型每轮静默丢信号的机会：改写中缩短 title、丢掉 child、或整棵丢弃仍然相关的树。需要观察：被丢的信号多久被用户从 widget 中发现；重写质量是否随 session 变长衰减；重写是否沦为机械复读（内容长期不变也不重审 signals）。

### add_drift adoption

add_drift 是否真的被用在设计场景——换方案或绕路的瞬间？还是被当作通用 mid-loop 更新（如果发生，观察追加内容的类型分布与质量），或干脆从不使用？满容量拒绝的出现频率也是信号：频繁的满容量拒绝说明 10 节点对实际工作太紧。

### Drift discoverability

Agent 能否可靠识别自己与 user intent 的真实偏差，而不是只记录抽象风险？用户纠正后，Agent 是否及时新增、解释并清理 drift；drift 的参照是对话中声明的意图与现行 map，用户沉默不代表接受；drift 长期存在时 Agent 是否会主动在对话中确认方向。

### Long-term intent inference

用户期待 goal 能承载会话级乃至项目级的意图（如"改进 rewrite tool"），但受控回放与真实使用中 LLM 均未主动写出长期意图，只停留在当轮请求的近目标（ADR 0016 的 ablation 两臂均如此）。goal 命名 + 意图级 guideline 改善了锚的稳定性与加深，但没有解决 long-term intent 的推断。待验证：独立 `set_goal` 通道是否改善意图提炼和写入时机；用户显式声明后的沿用行为；跨 session 的项目级 goal 该由谁声明。

### Fork edge cases

交互式 fork 会继承当前内存 snapshot。仍需验证从很早的 tree 节点 fork、从 CLI 直接 fork 与异常退出后的恢复是否都符合"继承当下状态"的用户预期。

### Success criteria

产品是否有效不能只看 workmap 调用次数。更有意义的指标包括：用户发现错误方向所需时间、需要追问"你现在为什么这样做"的次数、长 session 中接管所需时间，以及 map 被用户纠正后 Agent 行为是否真正改变。
