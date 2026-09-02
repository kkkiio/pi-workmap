# ADR 0016: Heading 改回 Goal，drift 前置到 goal 之下

- Status: Accepted
- Date: 2026-09-02

## Context

ADR 0008 曾基于"goal 零写入"的观测把 `goal` 改名为 `heading`。此后 kimi 3（kimi-coding/k3-256k）的真实使用暴露了新病理：heading 一词的排版先验使 Agent 把它当 session 标题（首 prompt 的字面复述僵死 30+ 轮）和文档小节（多开、当 topic label、当状态汇报），而不是"对用户意图的解读"。

用户的澄清给出正确粒度：这个类型应是**会话级用户意图**——回答"这个 session 为什么存在"；相位变化由 active Task 呈现，不该由锚跟踪。guidelines 里 "Lead with your reading of the user's latest prompt" 反而在推向每轮复述当轮问题。

同时，drift 作为显著度最高的信号（摘要行红色计数）却按插入序排在图末，位置与显著度不匹配；按 ADR 0009 的阅读顺序论证（先校准方向，再看偏差，然后才是细节），drift 应紧随 goal。

## Decision

1. 节点类型 `heading` 更名回 `goal`。定义收紧为：Agent 对用户在本 session **最终想要什么**的当前解读；更新触发是意图理解的变化或加深，不是相位切换。描述文案仅做 word swap，类型语义文字不变。
2. guideline 重写："Use goal for what the user ultimately wants from this session — the destination, never the route; routes are decisions. Update it only when your reading of their intent changes or deepens, not when the work phase shifts; a standing project-level direction may be marked long-term."
3. drift 在展示层（widget 与注入的 context 快照）前置到 goal 之下、其余 root 之前；state 仍为 append（沿用 ADR 0009"仅影响展示层"的先例），多个 drift 间保持插入序。`add_drift` 描述同步。
4. snapshot version 4→5；恢复时 version 4 快照做 heading→goal 迁移（沿用 ADR 0008 的迁移通道）。

## Evidence（受控回放 ablation）

pi-structural-edit 仓库在原 session 起点的快照（624845e），回放原 session 的前 7 条用户 prompt（含多次相位切换与一次范围收回），kimi-coding/k3-256k、thinking high，双臂单变量对照：

- **heading 臂**：7 轮换 7 个锚——每轮把当前问题顶成锚并丢弃上一轮内容；t7 的 map 只剩一条 understanding。锚彻底失去"评价基准"的作用。
- **goal 臂**：一锚贯穿 5 轮（"解释 matcher/replacement 现状，并给出两条跨层级匹配问题的处理方案"），t6 随意图加深更新为"……并评估修复路线"；瞬态查询（查 ast-grep clone）短暂试写为第二个 goal 后自行收回，归位 task。
- **两臂均未写出 long-term intent**（如"改进 rewrite tool"）——长期意图的推断独立于命名，转入 open-questions 跟踪。
- 观测到一例 status 误用（`goal|active`）；status 保持自由格式，观察是否复发。

局限：ablation 是组合变量（词 + guideline），未拆分纯命名效应；n=1、单模型。

## Consequences

- ADR 0008 的"goal 抑制写入"风险在本次观测中未复现（goal 臂写入量与 heading 臂相当）；若未来回归，优先检查类型定义与 guideline，而非词面。
- ADR 0009 的置顶规则扩展为：goal 置顶，drift 紧随，其余按插入序。
- ADR 0001–0015 中的 heading 字样为历史记录，不回改。
