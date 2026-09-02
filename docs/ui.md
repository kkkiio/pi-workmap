# UI Demos

Workmap 是 editor 上方的常驻 widget，只有一种渲染：完整树。容量上限即 widget 高度契约，屏上所见与模型声明的结构完全一致。

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

克制同样适用于文本：widget 只承载结构，不承载解释。具体含义是——屏上每一行文字都必须是一个信号本身（title 或 status），而不是关于信号的解释：没有图例、没有栏目标题、没有“what/why/how”式说明，意义全部由 glyph、颜色和 tree 结构承载。这样要求的原因：widget 是被动觉察表面，一场 session 里被扫过几十次，多一个字的解释都是几十次的重复阅读成本；而需要解释的内容（trade-off、原因、背景）在对话里已经有了家。Agent 天然倾向于在 UI 上补充说明文字，所以克制不靠 prompt 自觉，而靠结构保证——tool schema 和渲染管线里根本没有解释性文字的槽位，想写也无处可写。

## Generic map

```text
Workmap · 7 signals
✦ Restore trust in the auth layer                             long-term
✦ Fix the flaky auth test
├─ • Failure only happens concurrently                        observed
├─ • Token cache is shared                                    observed
├─ ◆ Inspect refresh path first                               chosen
├─ ◎ Reproduce the double-logout                              done
└─ ◎ Check whether refresh can race                            pending
```

非空 map 必含至少一条 heading（校验强制，不靠 prompt 自觉）——锚，其余信号对照它读；无标签的 heading 即当前焦点，排在最前，`long-term` 可选标注长期方向。其他类型的节点也可以作为 root。

## Authentication bug

```text
Workmap · 10 signals
✦ Keep the auth layer trustworthy                             long-term
✦ Stop users being randomly logged out
• Access token expiry looks normal                             observed
• Refresh requests occasionally overlap                       observed
◆ Should refresh serialization live on server or client?  considering
├─ ◇ Serialize in the client                                  candidate
├─ ◇ Make refresh idempotent on the server
└─ ◎ Compare approaches                                       active
◎ Reproduce race (rewrote 2 fixtures)                          done
◎ Inspect refresh handler                                     active
```

Option 的 trade-off 等解释性内容不进 widget，住在对话里。Decision 表示需要权衡或已承诺的选择：斟酌中时 title 可以写成疑问句，拍板后把结论**追加**到标题（“…? → 结论”）。Option 只放在 Decision 下；待验证的猜测写成 `Understanding · hypothesis`。事实问题不设节点类型——能查的直接调查，只有用户能答的在对话中问。done 的 title 记录副作用（改了什么、跑了什么），而不是只写“完成”。

## Capacity

widget 没有折叠态：`MAX_WORKMAP_NODES = 10`（含 children 递归计数），header 一行加节点至多十行，屏上所见就是模型声明的全部，不存在隐藏计数或采样提示。超限时整次 `set` 被拒绝——没有静默驱逐，模型必须自己决定留哪 10 个，重发即生效。排序压力因此落在写图时，而且这个决定全程可见、可纠正。

## Heading correction

```text
Workmap · 7 signals · 1 drift
✦ Preserve existing client behavior
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
