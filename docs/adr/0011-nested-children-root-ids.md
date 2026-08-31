# ADR 0011: 嵌套 children、root-only id 与更新时序引导

- Status: Accepted（修订 [ADR 0002](0002-single-parent-tree.md) 的校验方案）
- Date: 2026-08-31

## Context

两组真实使用证据驱动本次重构：

**Schema 对模型失误模式的鲁棒性。** 开发会话中观察到：Agent 连续十次声明"给节点挂父子关系"的意图，但发出的 tool call 始终缺失可选的 `parentId` 字段——文本通道与工具参数通道分离，且工具的平铺+引用表达把层级信息与内容分离，"记得多带一个可选字段"是一个反复发生的动作缺口。同时，update result 只回一行成功/失败计数，模型看不到自己声明的结构，错误信念十轮未被环境反驳。结论：**模型是工具的用户，用户系统性失败就是 API 的问题**，应从接口侧修。

**更新时序。** Workmap 的价值在工作过程中（用户实时跟随方向），不在收尾总结。实证：一次调试会话中 Agent 首个 run 写入 map 后 50 分钟未更新，用户被迫中途追问"你在干什么"。既有 guidelines 只有置信度维度的 "declare it early"（ADR 0008 相关），完全没有 loop 时序维度——"干活 50 分钟、结尾一次写齐"在旧措辞下每步都合规，却错过全部价值窗口。

## Decision

1. **嵌套 children 替代 parentId**：节点可带 `children` 数组，层级即内容本身，组合时无法绕开。Single-parent 从运行时校验变为构造上必然；dangling parent、cycle、"parent 必须先存在"三类校验随之删除。
2. **Root-only id**：只有顶层节点携带 semantic id；子节点无 id，随树生灭。所有变更操作（upsert/remove）只寻址整棵树。
3. **树粒度替换语义**：upsert 一个 root 整体替换其子树（原位替换保持顺序）；遗漏 children = 删除子树。该语义写入 schema description 与 guidelines，保持响亮。
4. **update result 回显树**：成功/失败计数之后附紧凑树形文本，让"遗漏导致的结构变化"在下一轮直接可见——这是对第 1 点配套风险的暴露机制。
5. **时序引导**：guidelines 加入唯一的 MUST——"You MUST have a heading before your first investigation or action after a user prompt"，并明确"an update saved for the final reply is a postmortem, not a workmap"；注入快照页脚同步带时序（heading before investigating, updates as you learn — not after you finish）。MUST 只给满足成本极低、客观可检查、击穿核心价值的规则，其余保持普通语气。
6. **不迁移旧 flat 快照**：restore 只认 `version: 2`，旧 flat/parentId 快照直接跳过。Workmap 的语义是当前态势感知而非长期存储——旧会话的 map 随代码与理解的演进而自然过期，重要结论应沉淀到文档；忽略旧数据与产品语义一致（0.x 阶段方针见 AGENTS.md）。

## Consequences

- `src/types.ts`：`WorkmapRoot`（带 id）/ `WorkmapChild`（递归、无 id）；`WorkmapSnapshot.version` 升为 2。
- 工具 schema 的递归按深度展开（上限 `MAX_WORKMAP_DEPTH = 8`）：provider 侧 tool schema 原样外发，不能依赖 `$ref` 支持。
- widget 与注入快照直接走树；compact 的子树排序作用于深拷贝，不回写 state。
- 若实践中出现"模型为改一片叶子反复重写大树"的噪声，再评估是否恢复局部寻址；当前树很小（32 节点上限），重写成本可忽略。
