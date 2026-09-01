# pi-workmap

![pi-workmap runtime widget](docs/assets/workmap-session.png)

`pi-workmap` 是一个由 LLM Agent 主动维护的 Pi extension。它把 Agent 当前的目标、理解、未知、决策、行动与已检测到的方向偏差提炼成一张常驻 workmap，让你随时扫读 Agent 的方向；发现偏差时在对话中直接纠正，Agent 会同时更新 workmap 和后续行动。

## Installation

Local installation:

```bash
pi install .
```

## Usage

Agent 会在 working model 发生实质变化时主动调用 `workmap` tool；存在节点后，一张最多 10 个信号的完整 workmap 会常驻 editor 上方，屏上所见即 Agent 当前声明的全部方向。地图写满时，最旧的信号子树会自动让位给新信息，不会报错打断工作。

随包附带的 `/workmap-tidy` prompt template 可让 Agent 对照最新方向与进展整理 workmap：刷新 heading、移除失效信号、了结已解决的 drift 与 decision。

## Session behavior

- 同一个 session 文件中的所有 `/tree` 分支共享最新 workmap，切换 branch 不会回滚它。
- `resume` 恢复该 session 的最新 workmap。
- `fork` 继承当下 workmap，之后与 parent session 独立演化。
- `new session` 从空 workmap 开始。
