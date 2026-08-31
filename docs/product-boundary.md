# Product Boundary

## 两种状态，不同寿命

```text
Current session                              Project lifetime
─────────────────────────────────────────    ─────────────────────────
shared working model                         durable knowledge
Heading / Understanding / Decision       code / ADR / design docs
Option / Task / Drift
fast-changing, incomplete, correctable       reviewed, intentional, stable
may disappear with the session               source of truth
```

`pi-workmap` 只负责左侧：当前 human 与 Agent 为完成这次工作而共享的 working model。

## Session-scoped shared working model

它应当：

- 随调查、决策和执行实时变化；
- 接受暂时性假设、不完整信息和被推翻的认识；
- 优化 human 扫读与纠正，而不是作为审计档案；
- 在 context compaction 或 session resume 时可恢复当前状态；
- 允许 session 结束后丢弃、保留快照或手动导出，但不默认污染 repo。

它的真值标准是：**现在是否足以让双方协调下一步。**

## Project-level durable knowledge

长期信息仍应进入有明确读者、评审和维护责任的 artifact：

- architecture decision → ADR；
- 产品与技术约束 → design doc / spec；
- 使用方式 → README / docs；
- 可执行事实 → code / tests / configuration；
- 协作与追踪 → issue / PR / changelog。

这些 artifact 的真值标准是：**未来的维护者是否可以把它当作经过选择的 source of truth。**

## 不自动越界

Workmap 不应默认：

- 把每个 Understanding 写入项目文档；
- 把每个 Decision 自动升级为 ADR；
- 跨 session 合并成“Agent memory”；
- 将临时假设或失败尝试长期保存；
- 用插件强制 Agent 持续维护所有项目知识。

需要沉淀时，human 可以明确要求 Agent 根据 workmap 生成或更新 durable artifact。这个动作应是有意图的编辑，而不是后台同步。

## 可以提供的桥梁

未来可考虑但不作为第一版默认行为：

- `export snapshot`：保存本 session map 供复盘；
- `draft ADR from decision`：以选中的 Decision 为素材起草 ADR；
- `handoff summary`：为新 session 生成经过 human 确认的上下文；
- `link artifact`：在节点上链接已有 ADR、issue、commit 或代码位置。

这些功能应保持单向、显式、可审阅：workmap 可以成为 durable docs 的输入，但不能悄悄成为另一套项目知识库。

## 与相邻产品的边界

| 相邻类别 | 主要问题 | 与 pi-workmap 的区别 |
|---|---|---|
| Todo / task manager | 还要执行哪些步骤 | Workmap 还展示认识、假设与决策；Task 可分组嵌套，但刻意不提供依赖、进度汇总与完成归档等执行追踪语义 |
| Plan review / approval gate | 是否批准一个计划 | Workmap 默认持续同步，不在每次变化时阻塞 |
| Scratchpad / working memory | Agent 如何保存临时材料 | Workmap 是双方可扫读的结构化 shared state |
| Session outline / trace | Agent 实际执行了什么 | Workmap 展示意图、理解和选择，不复刻 tool trace |
| ADR / spec system | 如何保存长期决策与设计 | Workmap 接受临时和未定状态，生命周期更短 |
| Knowledge base / memory | 如何跨 session 检索知识 | Workmap 默认局限于当前 session |
