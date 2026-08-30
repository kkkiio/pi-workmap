# pi-workmap

![pi-workmap expanded runtime widget](docs/assets/workmap-session.png)

`pi-workmap` 是一个由 LLM Agent 主动维护的 Pi extension。它把 Agent 当前的目标、理解、未知、决策、行动与已检测到的方向偏差提炼成一张常驻 workmap，让你随时扫读 Agent 的方向；发现偏差时在对话中直接纠正，Agent 会同时更新 workmap 和后续行动。

## Installation

Local installation:

```bash
pi install .
```

## Usage

Agent 会在 working model 发生实质变化时主动调用 `workmap` tool；存在节点后，widget 会常驻 editor 上方。

![pi-workmap compact runtime widget](docs/assets/workmap-session-compact.png)

按 Pi 官方的 `Ctrl+O`（`app.tools.expand`）同时切换 tool output 与 workmap 的 compact / expanded 状态。compact 优先呈现 Goal、Drift、Unknown、Decision 和 Task；expanded 显示完整树、Option 与 note。

## Session behavior

- 同一个 session 文件中的所有 `/tree` 分支共享最新 workmap，切换 branch 不会回滚它。
- `resume` 恢复该 session 的最新 workmap。
- `fork` 继承当下 workmap，之后与 parent session 独立演化。
- `new session` 从空 workmap 开始。
