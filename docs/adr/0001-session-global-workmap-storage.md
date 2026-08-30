# ADR 0001: 每个 session 一份 workmap，所有 `/tree` 分支共享

- Status: Accepted
- Date: 2026-08-30

## Context

Pi 的一个 session 可以通过 `/tree` 在多条 conversation branch 之间切换。Workmap 的用途不是复现某个历史分支当时的任务状态，而是持续展示 Agent 在**当前整个 session** 中声明的 working model，让 human 随时检查方向、理解关键判断并纠正偏差。

如果 workmap 跟随 branch 回滚，同一个 session 在切换 `/tree` 后会重新出现已经推翻的 Understanding、已经解决的 Unknown 或已经放弃的 Decision。Human 看到的 map 会取决于当前浏览位置，而不是双方最新的 common ground。这会削弱 situation awareness，也会让 Agent 在同一场协作中维护多份相互分叉的 mental model。

同时，workmap 不应成为 project-level durable knowledge 或跨 session memory。不同 session 可能有不同目标、假设和工作上下文，自动共享会造成状态污染。

## Decision

Workmap 以 **Pi session file** 作为唯一持久化边界：每个 session 一份当前 workmap，同一 session 内所有 `/tree` 分支共享它。

具体语义如下：

- 每次有效更新都向当前 session entries 追加一份完整 snapshot。
- 恢复状态时，从整个 session 的 entries 中读取最新合法 snapshot，而不是只读取当前 branch。
- `/tree` 只改变 conversation 的浏览与上下文分支，不回滚 workmap。
- `resume` 恢复该 session 最新的 workmap。
- `fork` 继承 fork 时的当前 workmap；创建后，parent session 与 forked session 各自独立演化。
- `new session` 从空 workmap 开始。
- workmap 不写入 project-level 文件，也不自动在不同 session 之间合并。

```text
Pi session
├─ conversation branch A ─┐
├─ conversation branch B ─┼─> one latest workmap snapshot
└─ conversation branch C ─┘

fork
├─ parent session  ──> independent workmap
└─ forked session  ──> inherited, then independent workmap
```

## Rationale

Workmap 表达的是双方**现在共同看到的协作状态**，而不是 conversation tree 的历史投影。Session-global storage 与产品的核心目标一致：human 在 Agent 自治工作时始终有一个稳定、最新、可纠正的检查面。

完整 snapshot 使一次 mutation 原子化，恢复逻辑也保持简单：找到最新合法 entry 即可。当前节点数量有明确上限，因此 snapshot duplication 的空间成本可控。

## Alternatives considered

### Branch-local workmap

每条 `/tree` branch 保存并恢复自己的 map，能重现历史分支当时的状态，但会让用户切换 tree 时看到过期认知，也会把 workmap 变成 conversation history 的一部分。它不符合“当前 session shared working model”的定位。

### Project-level file

把 workmap 写入 repository 文件，便于跨 session 恢复，但会把临时假设、Unknown 和中间 Decision 混入 durable project knowledge，并产生 merge、清理和 source-of-truth 问题。

### User-global or project-global store

所有 session 共用一份 map，可以减少显式 handoff，但不同 session 的目标和上下文会互相污染，也无法明确判断哪些状态仍然有效。

## Consequences

### Positive

- 同一 session 中，human 与 Agent 始终看到一份最新 workmap。
- `/tree` 不会意外恢复已经过期的方向或假设。
- resume、fork 和 new session 的生命周期边界清晰。
- 状态保存在 Pi session 内，不污染 repository，也不形成隐式长期 memory。

### Trade-offs

- `/tree` 不能用于查看某个历史节点当时的 workmap；如未来需要审计，应设计独立的 history/export 能力，而不是改变当前状态语义。
- 完整 snapshot 会在 session file 中重复保存节点；当前以较小的 node limit 换取恢复简单和 mutation 原子性。
- 从较早 conversation 节点继续工作时，Agent 仍会看到 session 最新 map；它必须主动删除或改写已不再适用的节点。

## Implementation note

`src/state.ts` 的恢复逻辑应扫描 `sessionManager.getEntries()` 中最新的合法 workmap snapshot，不应改为 `getBranch()`。任何改变这一行为的实现都需要先取代本 ADR。
