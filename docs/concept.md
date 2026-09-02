# Concept

## 核心问题

LLM Agent 被后训练成长时间自主执行。交互使用时，它往往先经历一段长考——对用户表现为沉默——然后突然开始动手：等用户看到动作，修改已经落进代码库，纠偏的时机已经过去。

用户需要在它动手之前知道它想做什么、为什么选这个方案。

`pi-workmap` 让 Agent 把当前 operational mental model 声明成一张常驻、可扫读的 map，并在每个 user prompt 全量重写：

```text
Agent internal reasoning
        │ distill; no chain-of-thought
        ▼
Agent-declared working model
        │ visible in the session
        ▼
Human inspects and corrects through conversation
        │
        └─ Agent updates both the map and its direction
```

> See what your agent intends before it acts — and why.

这张 map 由 Agent 主动维护，Human 不编辑另一份状态。纠偏发生在成本最低的时刻：方向在动手前被纠正，副作用通过 done 的 Task 可见。

## Selection

Map 不是全部 shared understanding。稳定的背景知识、能直接查到的事实不上去；只有**承重信息**上去——如果它错了，工作就会跑偏：

- 方向：Heading（想去哪）；
- 承诺与权衡：Decision / Option（凭什么走这条路）；
- 反直觉的发现：Understanding（不写下来就会忘的）；
- 行动账本：Task（打算做、正在做、已做及其副作用）；
- 偏差：Drift（已察觉方向不对）。

widget 最多 10 个节点，容量本身就是筛选器：写不进去的东西，要么不重要，要么属于对话或代码。

## 设计原则

- **Intent before action**：map 的首要读者动作是"动手前看一眼"，其次是执行中的持续对齐。
- **Current, not historical**：只保留仍影响当前方向的信息；map 是声明视图，不是日志或档案。
- **Regenerated, not accumulated**：每个 user prompt 全量重写，陈旧机制（增量寻址、staleness 计数）不存在。
- **Agent-maintained**：Agent 声明，Human 通过对话纠正。
- **Human-readable**：优化一眼扫读，而不是完整表达所有机器关系。
- **Restrained**：widget 只渲染结构，解释性内容住在对话里。

transparency 在这里的含义是经过提炼的目标、依据与选择，而不是 chain-of-thought；它帮助用户校准信任和介入时机，同时不把中间过程变成噪声。
