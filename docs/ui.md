# UI Demos

Workmap 是 editor 上方的常驻 widget，只有一种渲染：完整树（ADR 0013）。节点上限即 widget 高度契约，屏上所见与模型声明的结构完全一致。

![Workmap captured from a real Pi session](assets/workmap-session.png)

## Visual language

```text
✦  Heading
•  Understanding
◆  Decision
◇  Option
◎  Task
⎇ Drift
```

用色遵循 Pi 和 `pi-tasks` 的克制方式：正文与普通 glyph 使用默认文字色；Heading / Decision glyph 使用 accent，Drift 使用 error；`status` 与 tree connector 使用 dim。灰色只表示辅助信息，不额外编码领域状态。

颜色表达的是"晚看的代价"而非严重程度：Drift 是唯一成本随延迟增长的信号——用户没看到的每一分钟，Agent 都可能带着偏差继续干活——所以它用最抢眼的 error 色；accent 用于定位方向（Heading / Decision）。Drift 本身只是"提请确认"：用户可以纠正、接受，或等待相关工作自然完成。如果实践中 Drift 频繁出现，应先修 Agent 的过度报告，而不是调低颜色。

克制同样适用于文本：widget 里不允许解释性文字——没有图例、没有栏目标题、没有"what/why/how"式描述，意义由 glyph、颜色和 tree 结构承载。Agent（尤其 GPT）倾向于在 UI 上补充文本说明，这被视为需要压制的默认行为，而不是可选的润色。

## Generic map

```text
Workmap · 8 signals
✦ Fix flaky auth test                                         current
├─ • Failure only happens concurrently                        observed
├─ • Token cache is shared                                    observed
├─ ◎ Check whether refresh can race                            active
├─ ◆ Inspect refresh path first                               chosen
└─ ◎ Reproduce                                                done
   ├─ ◎ Inspect refresh path                                  active
   └─ ◎ Test hypothesis                                      queued
```

Heading 是可选的方向信号，不是强制容器。多个 Heading 可以平级，其他节点也可以作为 root。

## Authentication bug

```text
Workmap · 9 signals
✦ Stop users being randomly logged out                        current
• Access token expiry looks normal                             observed
• Refresh requests occasionally overlap                       observed
◆ Should refresh serialization live on server or client?  considering
├─ ◇ Serialize in the client                                  candidate
├─ ◇ Make refresh idempotent on the server
└─ ◎ Compare approaches                                       active
◎ Reproduce race                                               done
◎ Inspect refresh handler                                     active
```

Option 的 trade-off、blocked 的原因等解释性内容不进 widget，住在对话里。Decision 表示需要权衡或已承诺的选择：斟酌中时 title 可以写成疑问句，拍板后把结论**追加**到标题（"…? → 结论"）。Option 只放在 Decision 下；待验证的猜测写成 `Understanding · hypothesis`。事实问题不设节点类型——能查的直接调查，只有用户能答的在对话中问。

## Capacity and eviction

widget 没有折叠态：`MAX_WORKMAP_NODES = 10`，header 一行加节点至多十行，不存在"图里有但屏上没有"的状态，因此也不存在隐藏计数或采样提示。上限满时新的 update 不会报错，而是自动驱逐整棵子树：最久未 upsert 且不含活信号（drift、considering Decision、blocked Task）的树先走，其次最老的树；被驱逐的 root 以 `id (title)` 列表回显进 tool result（ADR 0013）。排序压力因此落在写图时——模型必须显式决定留什么，用户全程可见、可纠正。

## Heading correction

```text
Workmap · 7 signals · 1 drift
✦ Preserve existing client behavior                           current
⎇ Implementation started changing the public API             detected
◆ Keep the public API stable                                  chosen
◎ Move serialization behind the existing refresh method       active
```

Drift 出现意味着 Agent 已识别真实不一致；它不是泛化的风险清单。偏差消解后应删除——无论消解来自用户纠正、用户接受（结论转为 Decision / Understanding），还是相关工作自然完成——而不是作为历史记录保留。用户未明确回应时 drift 应保留；沉默不等于接受。

## Layout rules

- widget 常驻 editor 上方，不使用 overlay，也不提供 human editor；纠正发生在对话中。
- 单一完整树视图：Heading 类型的 root 置顶，锚先于细节；没有 compact/expanded 切换，也不复用 `app.tools.expand`。
- header 的 drift 计数使用 error 色；drift 是唯一"晚看比早看贵"的信号，显著性必须第一。
- 所有 glyph 统一按两个终端列宽的单元格渲染，宽于单列的 glyph 也与其他 glyph 的 title 保持同列左对齐。
- `status` 只在 title 至少保留 20 列时右对齐；窄终端先隐藏 status，优先保留 title。
- node title 保持单行可扫读；解释、trade-off 与原因住在对话里。
- 只有嵌套 `children` 构成的 single-parent tree；不显示 refs 或 DAG edges。
