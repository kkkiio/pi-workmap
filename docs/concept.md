# Concept

## 核心问题

LLM Agent 可以连续调查、形成假设、选择路线并执行，但 human 往往只看到零散消息和 tool output。随着 session 变长，双方容易对“目标是什么、Agent 当前相信什么、哪里还不确定、为什么往这个方向走”形成不同理解。这就是 **shared mental model gap**。

`pi-workmap` 让 Agent 把当前 operational mental model 提炼成一张常驻、可扫读的 shared map：

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

这张 map 由 Agent 主动维护。Human 不需要编辑另一份状态；它的价值在于让用户及时发现方向偏差、缺失假设和过早承诺。

## 相关概念

### Common ground

协作所依赖的共同基础，不只是“某条信息出现过”，还包括双方都能看到、理解并在必要时修正它。Workmap 是建立和修复 common ground 的界面，不声称双方的内部模型完全相同。

### Situation awareness

Human 需要知道当前有哪些重要事实，它们意味着什么，以及工作可能走向哪里。只展示 Agent 正在调用哪个 tool，只覆盖 activity visibility；Heading、Understanding、Decision 与 Task 才共同构成可用的 situation awareness。

### Agent transparency

这里的 transparency 是经过提炼的目标、依据、未知、选择和行动，而不是 chain-of-thought。它应该帮助用户校准信任和介入时机，同时避免把所有中间过程变成噪声。

### Decision opacity

如果 Agent 从调查直接跳到实现，human 可能看不到曾有哪些 alternatives、采用了什么 trade-off。Decision 与 Option 把高影响选择外显，但不要求每个选择都设置 approval gate。

### Silent assumption

Agent 把未经确认的前提当作事实，会让双方看似沿同一路线、实际依赖不同模型。此类前提应成为 `Understanding`，必要时标记为 `hypothesis`；待调查的事实问题应直接调查，或在只有用户能答时在对话中提出，不设专门节点类型。

### Premature commitment

在关键事实尚未澄清时过早选定方案，会压缩探索空间。显式的 hypothesis、Decision 和 considered Options 让 human 能在实现成本扩大前看见这种收敛。

### Out-of-the-loop

Agent 自治越强，human 越容易只在最终结果出现时才重新进入情境。常驻 widget 提供低打扰的 passive awareness，让用户能跟上方向，而不是把每一步都变成审批。

### Drift

`Drift` 不是一般风险，也不是 blocker。它表示 Agent 已检测到当前方向与用户意图或现行 workmap 存在实际偏差。它应高优先级出现，并在偏差消解后删除——消解可以是 Agent 被纠正后改向、用户接受 Agent 的方案（此时结论应转为 Decision 或 Understanding），或相关工作完成使偏差失效。

## 概念关系

```text
silent assumption ─┐
decision opacity ──┼─> shared mental model gap
premature commitment┤             │
out-of-the-loop ───┘              ▼
                           weak common ground
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
          poor situation awareness      late correction / drift

workmap = restrained agent transparency + visible correction surface
```

## 设计原则

- **Current, not historical**：只保留仍影响当前方向的信息。
- **Agent-maintained**：Agent 在 mental model 实质变化时主动更新。
- **Human-readable**：优化一眼扫读，而不是完整表达所有机器关系。
- **Correctable**：用户通过对话纠正；Agent 随后更新 map 和行动。
- **Restrained**：widget 只渲染单棵完整树，颜色只承担明确含义。
- **Declared, not hidden**：展示 Agent 愿意据此行动的 working model，不捕获隐藏推理。
