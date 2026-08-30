# Naming

## 命名目标

名字应同时暗示：

- 当前工作，而不是永久知识；
- human 与 Agent 共享，而不是 Agent 私有状态；
- 包含认识、未知、决策和执行，而不只是 todo；
- 是可扫读的 map，而不是对 reality 的完整复制。

## 候选比较

| 名称 | 优点 | 风险 |
|---|---|---|
| `pi-workmap` | 短、好记、像可安装的产品；`work` 覆盖 understanding 与 execution | 名字本身没有直接写出 `shared` 和 `session` |
| `pi-shared-map` | 直接表达 human–agent 共享状态，概念完整 | 稍抽象，`shared` 可能被理解为多人协作或跨 session |
| `pi-whiteboard` | 很好地表达临时、可擦除、双方共用的空间 | 容易让人期待自由画布、diagram 或 Excalidraw |
| `pi-common-ground` | 理论上最准确：双方都知道且知道对方可见 | 产品直觉较弱，第一次看到不容易猜到功能 |
| `pi-session-map` | 明确 session scope | 可能被误解为对话结构、message tree 或 session navigation |
| `pi-mental-map` | 直观强调理解模型 | 容易暗示读取隐藏思维或 chain-of-thought |
| `pi-outline` | 与 tree UI 很贴近 | 更像目录或 execution trace，弱化 decision / unknown |
| `pi-roadmap` | 容易理解未来步骤 | 过度聚焦 plan，不能表达当前认识与问题空间 |
| `pi-situation` / `pi-sitmap` | 对应 situation awareness | 抽象或略显军事化，不够自然 |
| `pi-compass` | 强调方向与纠偏 | 不足以表达 shared understanding 的结构 |

## 与已有概念的语义区分

```text
scratchpad  = temporary knowledge and intermediate artifacts
whiteboard  = free-form visual expression and diagrams
tasks       = execution plan and dependency tracking
convergent  = shared artifact plus explicit approval loop
workmap     = current shared understanding of the work
```

`@yishan-io/pi-dev-flow` 已使用 whiteboard 表示 Excalidraw scene editing；`@nikiforovall/pi-scratchpad` 已将 scratchpad 用于临时知识与中间文件。这不构成功能冲突，但让 `pi-whiteboard` 与 `pi-scratchpad` 更容易产生错误期待。

## 暂定结论

项目暂定名为 **`pi-workmap`**。

它最像一个简洁、可发现的 package 名；缺失的 shared/session 语义可以由一句稳定的产品描述补齐：

> A live shared map of what you and your Pi agent currently understand about the work.

备选顺序：`pi-shared-map`、`pi-whiteboard`、`pi-common-ground`、`pi-session-map`。

