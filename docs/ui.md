# UI Demos

Workmap 是 editor 上方的常驻 widget。它复用 Pi 官方 `app.tools.expand` 状态：按 `Ctrl+O` 时，tool output 与 workmap 一起在 compact / expanded 之间切换。

![Expanded workmap captured from a real Pi session](assets/workmap-session.png)

## Visual language

```text
◎  Goal
•  Understanding
?  Unknown
◆  Decision
◇  Option
□  Task
⚡ Drift
```

用色遵循 Pi 和 `pi-tasks` 的克制方式：正文与普通 glyph 使用默认文字色；Goal / Decision glyph 使用 accent，Unknown 使用 warning，Drift 使用 error；`status`、tree connector 与 `note` 使用 dim。灰色只表示辅助信息，不额外编码领域状态。

颜色编码的是所需的用户行动：error 表示需要纠正（Drift 是唯一要求用户介入的信号），warning 表示需要知晓（Unknown，不需要用户行动），accent 用于定位方向（Goal / Decision）。如果实践中 Drift 频繁到配不上 error，应先修 Agent 的过度报告，而不是调低颜色。

## Generic map

```text
Workmap · 8 signals                                      ctrl+o compact
◎ Fix flaky auth test                                         current
├─ • Failure only happens concurrently                        observed
├─ • Token cache is shared                                    observed
├─ ?  Whether refresh can race                                open
├─ ◆ Inspect refresh path first                               chosen
│     Failure looks state-related.
└─ □ Reproduce                                                done
   ├─ □ Inspect refresh path                                  active
   └─ □ Test hypothesis                                      queued
```

Goal 是可选的方向信号，不是强制容器。多个 Goal 可以平级，其他节点也可以作为 root。

## Authentication bug

```text
Workmap · 11 signals                                     ctrl+o compact
◎ Stop users being randomly logged out                        current
• Access token expiry looks normal                             observed
• Refresh requests occasionally overlap                       observed
?  Should refresh serialization live on server or client?     open
◆ Refresh serialization ownership                         considering
├─ ◇ Client-side serialization
│     Smaller server change, but assumes one client instance.
├─ ◇ Server idempotency
│     More robust across workers, but a larger change.
└─ □ Compare approaches                                       active
□ Reproduce race                                               done
□ Inspect refresh handler                                     active
```

Unknown 问事实问题；Decision 表示需要权衡或已承诺的选择。Option 只放在 Decision 下，Unknown 的可能答案则写成 `Understanding · hypothesis`。

## Compact mode

![Compact workmap captured from a real Pi session](assets/workmap-session-compact.png)

```text
Workmap · 9 signals                                      ctrl+o expand
◎ Stop users being randomly logged out                        current
⚡ Client-only fix conflicts with multi-worker evidence      detected
?  Can refresh races cross workers?                       investigating
◆ Prefer server-side idempotency                              chosen
□ Add concurrent refresh regression test                      active
  … 4 more · 2 understandings · 1 option · 1 task
```

compact 按 alignment value 而不是 tree 顺序挑选最多五个节点：Goal、Drift、Unknown、Decision、Task 优先。它用于持续扫读，不试图容纳完整结构。`… N more` 附带被隐藏节点的类型计数，帮助用户判断是否值得展开。

## Direction correction

```text
Workmap · 7 signals · 1 drift                            ctrl+o compact
◎ Preserve existing client behavior                           current
⚡ Implementation started changing the public API            detected
   The user asked for an internal fix without API changes.
◆ Keep the public API stable                                  chosen
□ Move serialization behind the existing refresh method       active
```

Drift 出现意味着 Agent 已识别真实不一致；它不是泛化的风险清单。偏差消解后应删除——无论消解来自用户纠正、用户接受（结论转为 Decision / Understanding），还是相关工作自然完成——而不是作为历史记录保留。用户未明确回应时 drift 应保留；沉默不等于接受。

## Layout rules

- widget 常驻 editor 上方，不使用 overlay，也不提供 human editor；纠正发生在对话中。
- compact 优先 signal；expanded 才显示完整 tree、Option 与最多两行 note。
- header 的 drift 计数使用 error 色；drift 是最需要用户介入的信号。
- 所有 glyph 统一按两个终端列宽的单元格渲染，双宽的 ⚡ 与其他 glyph 的 title 保持同列左对齐。
- `status` 只在 title 至少保留 20 列时右对齐；窄终端先隐藏 status 与快捷键 hint，优先保留 title。
- node title 保持单行可扫读，note 只解释必要证据、条件或 trade-off。
- V1 只有 `parentId` tree；不显示 refs 或 DAG edges。
