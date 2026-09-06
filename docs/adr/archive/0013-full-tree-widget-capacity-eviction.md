# ADR 0013: widget 单一完整树视图与容量驱逐

- Status: Partially superseded by [ADR 0015](0015-full-rewrite-set-add-drift-two-layer.md)（单一完整树视图与 height contract 保留；驱逐与树龄删除，容量改为校验拒绝）
- Date: 2026-09-01

## Context

compact 采样把排序压力放在**渲染层**：簇按对齐价值排序、超出预算的节点折叠为 `… N more` 计数。这带来两个实际问题——

1. **排名对用户不可见、不可纠正。** 哪个簇被挤掉是渲染时的隐式决定；完整地图只在 expanded 模式可见，而 expanded 与 tool output 共享 `Ctrl+O`，用户展开通常是为了看工具输出，不是看地图。实际使用中，老 Decision 长期占据 compact 的头部行，新信息被挤进 `… N more`，用户在常驻视图里看不到进展。
2. **note 失去读者。** 注入快照已剔除 note（ADR 0006），note 的唯一消费方是 expanded widget。一旦放弃多模式渲染，note 就成了只有写入方、没有读取方的字段。

另一个驱动是 LLM 行为：已拍板的 Decision 倾向于无限期留在图上，其代价过去被 compact 的折叠掩盖，现在需要在机制层处理。

## Decision

1. **widget 只保留一种渲染：完整树**（heading 置顶）。compact/expanded 切换、header 快捷键 hint、`… N more` 隐藏计数随之删除——没有隐藏节点，就没有隐藏计数。
2. **note 全链路移除**（schema、校验、清洗、widget 渲染）。结构进 widget，解释进对话；`"? → 结论"` 的 Decision 标题惯例保留。
3. **`MAX_WORKMAP_NODES` 32 → 10。** 上限从"可折叠视图的余量"变为 widget 的高度契约：display bound == state bound。
4. **溢出不报错，自动驱逐整根，两档 LRU**：
   - 第一档：最久未 upsert 且子树**无活信号**（drift、`considering` Decision、`blocked` Task）的 root 先驱逐；
   - 第二档：无第一档候选时，驱逐最老的 root（含 heading）；
   - 驱逐结果以 `id (title)` 列表回显进 tool result；被驱逐状态同时经每 run 注入快照可见。
   - 唯一报错例外：单个 update 本身就超过容量（换任何驱逐策略都放不下），拒绝该次调用并提示拆分。
5. **工具调用路径的深度由 provider schema 的 unroll 兜底**，unroll 收紧到 3 层（root / children / grandchildren）；restore 不经过 schema，保留运行时深度校验以拒绝超深快照。10 节点预算下更深的嵌套也没有存在空间。
6. **持久化快照升 version 3**：每个 root 携带 `updatedAt`（树龄 = 最近一次 upsert 的时间，重申即续期），note 字段移除。旧快照跳过不迁移——包未发布，无已发布数据需要兼容（ADR 0011 先例）。

## Rationale

**排序压力从渲染层移回内容层。** compact 在渲染层隐式排名，用户看不见也无法纠正；完整树 + 硬上限逼模型在**写图时**显式决定留什么、删什么，而这个决定全程可见、可在对话中被纠正。上限收紧正是让这份压力真实生效的手段。

**用户与模型看到的东西第一次完全一致。** 注入快照（ADR 0004/0006）本就是纯结构；单一完整树视图使 widget 成为同一份结构的渲染版。ADR 0006 的"note 有两个读者"的定位模糊，从被规避变为被消灭。

**驱逐选整根是结构必然。** 子节点无 id、root 是唯一可寻址单元（ADR 0011），抽掉中间节点会产生孤儿语义；整根删除是原生操作，且一次释放多个槽位。

**无错驱逐优于硬拒绝。** 报错会触发 LLM 返工（修剪后重发整棵树）。被否决的替代方案：硬拒绝 + 等模型修剪（多一轮往返）；不设保护的无差别 FIFO（会驱逐 heading、drift 与开放问句）。两档设计把活信号的保护做进优先级而非做成绝对禁飞区——图满且全是活信号时也照驱逐最老者，机制永远不报错。旧树被驱逐后原样重发的复活风险由 tool result 回显与快照注入共同压低，不再追加 guideline 说教。

## Consequences

- widget 最坏高度恒定：1 行 header + 10 行。不存在"图里有但屏上没有"的状态，一切针对隐藏信息的补偿机制（计数、采样、提示）都失去对象。
- Option 的 trade-off、blocked 原因等解释性内容失去 UI 载体，回到对话；ADR 0003 的 `Task · blocked + note` 面包屑弱化为 `Task · blocked`。
- `Ctrl+O` 不再影响 workmap widget，仅作用于 tool output。
- 树龄依赖 `updatedAt`：session restore 时无法从历史恢复逐树时间戳的部分统一置为 restore 时刻，以插入序做平局裁决。
