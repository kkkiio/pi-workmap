# ADR 0003: 不设 Blocker 节点，阻塞用 Task status 与对话表达

- Status: Accepted（Task · blocked 面包屑通道已被 [ADR 0015](0015-full-rewrite-set-add-drift-two-layer.md) 删除；"硬阻塞走对话"原则保留并加强）
- Date: 2026-08-30

## Context

被阻塞的工作是真实且重要的信息，几乎每个任务管理系统都把 blocked 作为一等状态或类型。工程直觉会让 workmap 也增加一个 Blocker 节点。

但 workmap 的节点类型沿**认识论角色**划分——这条信息在 shared working model 里扮演什么角色（要去哪、相信什么、不知道什么、在选什么、在做什么、哪里偏了）。而 blocked 回答的是"它现在怎么了"，属于生命周期状态，与 `active`、`done`、`investigating` 同轴。同时，workmap 只是被动觉察表面，需要用户及时行动的信号有自己的通道：对话。

## Decision

不设 Blocker 节点类型。阻塞信息按性质分流到三个已有通道：

- **硬阻塞**（没有用户就无法继续）→ Agent 停下来，在**对话**中直接说明并提问；workmap 上只留残余标记。
- **绕路**（Agent 能自己处理）→ 绕路本身是一个 **Decision**；如果绕路偏离了用户意图或已声明的 map，那是 **Drift**。
- **残余状态** → Task 使用自由 `status`（如 `blocked`）+ `note` 写明原因。阻塞的原因如果是事实问题或待拍板的选择，同时建为独立的 Unknown 或 Decision 节点。

```text
需要用户才能继续          能绕路                    残余标记
       │                      │                        │
       ▼                      ▼                        ▼
   对话（主动升级）      Decision / Drift        Task · blocked + note
   passive surface 不承载告警        方向变化              map 上的面包屑
```

## Rationale

**正交性。** Blocker-as-type 是把状态轴的值伪装成类型轴的值，和不设 Completed 节点是同一个道理。每增加一个类型都要付出 glyph、色彩语义与 Agent 分类准确率的成本；Blocker 还会与 Drift 持续混淆（"这挡住了计划" vs "这偏离了计划"），而"出问题"的信号保持单一（Drift）才干净。

**信息载荷分解。** Blocker 的价值不在"被阻塞"这个标签，而在"为什么"。原因几乎总能分解为已有的第一类信号：卡在事实问题 → Unknown；卡在等拍板 → Decision；卡在方向不一致 → Drift。Blocker 节点是复合节点伪装成原子节点，会把这些信号偷渡进一个标签；强制 Agent 把原因建成独立节点，对齐价值更高。

**通道分工。** Workmap 是 passive awareness 表面：可扫读、display-only、持续存在。需要用户及时行动的信号属于 active escalation，必须走对话——Agent 停下来问。把告警钉在被动表面上是通道错配；approval gate 正是这种反模式。用户离开后再回来时，widget 是重新进入情境的入口，此时 `Task · blocked · note` 作为指向对话的面包屑依然有价值——它不需要显著性，只需要存留。

**与 Drift 的边界。** Drift 是方向问题（去的地方不对），blocked 是进度问题（方向没变，路上有障碍）。检验方法："障碍消失后，Agent 会接着做原来那件事吗？"会 → blocked；不会、且没有告知 → drift。把例行阻塞标成 ⚡ 会稀释 error 信号的告警价值；而如实标记 blocked 恰恰是防止"map 说 active、实际在等"这种 map 失真的机制。

## Alternatives considered

### Blocker 节点类型

一等类型带来专用 glyph 与色彩，但如上述是范畴错误，并与 Drift 混淆；类型词表每扩一项，7 类型的扫读经济就被削弱一分。

### 结构化 blocked 状态机

把 status 做成 enum（`active / blocked / done`）并给 blocked 特殊渲染与 compact 优先级提升。显著性需求已由对话通道和原因节点（Unknown / Decision 在 compact 中优先级本来就高）满足；状态机违背自由 status 的克制原则，词汇纪律先在 prompt guidance 中推荐，验证不足后再考虑固化。

## Consequences

### Positive

- 节点类型保持 7 个，glyph 与色彩语义不膨胀。
- "出问题"的信号唯一（Drift），error 色保持稀缺与可信。
- 阻塞原因被强制显式化为 Unknown / Decision，用户能看到介入点。
- 通道分工原则可复用：它同时解释了为什么不做 approval gate。

### Trade-offs

- 硬阻塞依赖 Agent 主动停下来问；如果它倾向于默默标记继续干活，信号会丢失。escalation reliability 列入 open questions 验证。
- 自由 status 可能出现 `blocked / stalled / waiting` 词汇漂移，已在 open questions 跟踪。

## Implementation note

`src/types.ts` 不包含 blocker 类型；`src/index.ts` 的 promptGuidelines 推荐常规 status 词汇，并要求硬阻塞在对话中直接升级，而不是只标记 map。任何新增 Blocker 类型或 blocked 状态机的实现都需要先取代本 ADR。
