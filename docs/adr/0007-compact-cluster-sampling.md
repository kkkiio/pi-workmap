# ADR 0007: compact 模式以 cluster 为采样单位

- Status: Accepted
- Date: 2026-08-31

## Context

compact 最初按类型优先级取 top-5 节点平铺渲染。这假设每个节点自包含——对 pi-tasks 的条目成立，对 workmap 不成立：Option 脱离 Decision 没有意义，子 Task 脱离父 Task 损失上下文。实际后果是 Option（优先级最低）几乎永远折叠进 `… more`，"Option 属于 Decision"这一定义性关系在常驻视图中不可见，用户无法从 compact 学会类型系统（实使用中出现两轮困惑）。

## Decision

compact 以 **cluster**（root 连同子树）为采样单位：

- 簇按"簇内最高对齐价值成员"排序（Goal、Drift、Decision 优先）；
- 全局最多 5 行，每簇最多 3 行；
- 被选中的簇以缩进 tree 渲染，兄弟按对齐价值排序而非插入顺序；
- Option 的紧凑优先级提升到紧随 Decision，保证决策簇内 option 先于 task / understanding 出现。

## Rationale

**子节点的意义是关系性的，采样单位必须承认这一点。** 被否决的替代方案：机会主义分组（parent 与 child 恰好都入选才缩进——Option 优先级低，几乎永不生效）与祖先拉入（把 parent 链计入预算——一个决策簇可吃掉 5 行中的 4 行）。每簇 3 行的上限是对多样性损失的制衡：一个胖树不能把其他信号全部挤出常驻视图。

## Consequences

- expanded 模式不变（完整 tree + note，插入顺序）。
- `… N more` 计数逻辑不变，覆盖未渲染的节点。
- 行预算与簇预算在不同终端高度下的取值仍待验证（见 `docs/open-questions.md`）。
