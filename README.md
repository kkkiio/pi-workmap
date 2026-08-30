# pi-workmap

![pi-workmap expanded runtime widget](docs/assets/workmap-session.png)

`pi-workmap` 是一个由 LLM Agent 主动维护的 Pi extension。它把 Agent 对当前工作的 Goal、Understanding、Unknown、Decision、Option、Task 与已检测到的 Drift 显示成常驻 workmap，让用户随时检查 Agent 的方向是否对齐，并跟上它的 operational mental model。

它展示的是经过提炼、可供协作检查的 working model，不是 chain-of-thought。用户无需维护另一份列表；发现目标、假设或方向不对时，直接在对话中纠正 Agent，Agent 会更新 workmap 和后续行动。

它不是普通 todo list、长期 memory 或项目知识库，也不会强制把 session 自动写成 ADR / design docs。值得长期保存的结论仍应通过有意图的编辑进入 code、tests、ADR、README、issue 等 durable artifacts。

## Installation

项目尚未发布。在 repository 根目录执行：

```bash
pi install .
```

也可以不安装，直接加载源码：

```bash
pi --no-extensions --extension ./src/index.ts
```

## Usage

正常开始 Pi session 并描述工作即可。Agent 会在 shared working model 发生实质变化时主动调用 `workmap` tool；存在节点后，widget 会常驻 editor 上方。

```text
你：排查用户偶尔被登出的原因，先别急着改代码。

Workmap · 5 signals
◎ 找到随机登出的原因                           current
• Refresh requests occasionally overlap        observed
?  Can the race cross workers?                 investigating
◆ Refresh serialization ownership             considering
□ Trace worker IDs on concurrent refreshes     active
```

按 Pi 官方的 `Ctrl+O`（`app.tools.expand`）同时切换 tool output 与 workmap 的 compact / expanded 状态。compact 模式优先呈现 Goal、Drift、Unknown、Decision 和 Task；expanded 模式显示完整树、Option 与 note。

## Mental model

```text
Agent internal reasoning
        │ distill — no chain-of-thought
        ▼
Agent-declared working model
        │
        ▼
Persistent workmap widget
        │
        ├─ user follows the current direction
        ├─ user detects mismatch or silent assumptions
        └─ user corrects the Agent through conversation
```

节点语义：

| Type | 表示什么 |
|---|---|
| `Goal` | 当前影响方向的结果；长期目标使用自由状态 `long-term` |
| `Understanding` | Agent 当前采用的事实、综合理解、推断或 hypothesis |
| `Unknown` | 可以通过调查或证据回答的事实问题 |
| `Decision` | 正在权衡的选择或已经作出的承诺 |
| `Option` | Decision 的 considered alternative，不是 Unknown 的可能答案 |
| `Task` | 当前行动；blocked 等信息使用自由 `status` 与 `note` |
| `Drift` | 已检测到的 Agent 方向与用户意图或现行 workmap 之间的偏差 |

## Session behavior

- 同一个 session 文件中的所有 `/tree` 分支共享最新 workmap，切换 branch 不会回滚它。
- `resume` 恢复该 session 的最新 workmap。
- `fork` 继承当下 workmap，之后与 parent session 独立演化。
- `new session` 从空 workmap 开始。
- project-level 长期知识仍应进入 code、ADR、design docs、README 或 issue；workmap 不会自动成为长期 memory。

更完整的设计背景见 [Concept](docs/concept.md)、[Data Model](docs/data-model.md)、[Product Boundary](docs/product-boundary.md) 与 [References](docs/references.md)。
