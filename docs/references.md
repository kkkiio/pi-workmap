# References

本页记录对 `pi-workmap` 产品方向有直接帮助的资料。项目状态与 package 版本会变化；链接指向原始文章、repository 或 Pi package 页面，而不是搜索结果。

## 起点：unknowns、map 与 territory

### Anthropic / Claude — A field guide to Claude Fable: finding your unknowns

- 链接：[Claude 官方文章](https://claude.com/blog/a-field-guide-to-claude-fable-finding-your-unknowns)
- 可借鉴点：把 prompt、skills 与 context 比作 map，把 codebase、现实约束与实际行为比作 territory；两者的缺口会产生 unknowns，而且 unknowns 会在实现过程中继续出现。文章还建议记录 implementation deviations 与 decisions。
- 与 `pi-workmap` 的差异：文章提供协作方法与临时 notes 习惯；`pi-workmap` 试图把持续出现的 Heading、Understanding、Decision 与 Task 做成 live shared state。

## Pi task、plan 与 execution visibility

### `@tintinweb/pi-tasks`

- 链接：[GitHub — tintinweb/pi-tasks](https://github.com/tintinweb/pi-tasks)、[Pi package — `@tintinweb/pi-tasks`](https://pi.dev/packages/%40tintinweb/pi-tasks)
- 可借鉴点：Claude Code-style task tools、dependency、owner、persistent visual widget，以及完成/进行中/阻塞状态的紧凑呈现。
- 差异：核心是 task tracking 与 coordination；`pi-workmap` 需要把任务的上游认识、unknown、option 与 decision rationale 一起展示。

### `eleqtrizit/pi-tasks` / package `pi-taskgraph`

- 链接：[GitHub — eleqtrizit/pi-tasks](https://github.com/eleqtrizit/pi-tasks)
- 可借鉴点：双向 `blocks` / `blockedBy`、dependency-aware 状态转换、parallel-ready task 查询与实时 widget，说明 DAG 很适合执行调度。
- 差异：底层关系丰富但主要服务 task graph；`pi-workmap` 优先让 human 扫读 shared understanding，因此 V1 只采用 single-parent tree，不提供 refs 或 task DAG。

### `pi-todotools`

- 链接：[GitHub — code-yeongyu/pi-todotools](https://github.com/code-yeongyu/pi-todotools)
- 可借鉴点：phase → task 两级组织、branch-local session persistence、原子更新与 sidebar widget；适合参考轻量模型写入方式。
- 差异：phase-based todo 仍回答“接下来做什么”；`pi-workmap` 还要回答“我们知道什么、哪里不确定、为什么这样做”。

### Pi Desktop — Session Outline Sidebar

- 链接：[GitHub — StarkInternationalAI/pi-desktop](https://github.com/StarkInternationalAI/pi-desktop)
- 可借鉴点：用 tree 展示 prompt、response 与 tool result 的 session structure，并支持跳转；证明 tree 对长 session 导航和空间记忆很有效。
- 差异：Session Outline 是 execution/conversation trace；`pi-workmap` 是经过选择的 intent、understanding 与 decision state，不重放所有发生过的动作。

### `@pedro_klein/pi-task`

- 链接：[Pi package — `@pedro_klein/pi-task`](https://pi.dev/packages/%40pedro_klein/pi-task)
- 可借鉴点：DAG plans、sub-tasks、parallel groups、interactive `/task` browser、active plan context injection 与跨 context reset 的恢复。
- 差异：它关注 durable implementation plan 与执行就绪状态；`pi-workmap` 关注 session 内双方对问题和决策的共同理解，Task 只是其中一种 node。

### `pi-task-manager`

- 链接：[Pi package — `pi-task-manager`](https://pi.dev/packages/pi-task-manager)、[GitHub — gilgil/pi-task-manager](https://github.com/gilgil/pi-task-manager)
- 可借鉴点：真正的 parent/child TODO tree、缩进 Markdown 存储、stable id、subtree move，以及额外 dependency 字段；是 tree-first 数据模型的直接参考。
- 差异：节点仍都是 tasks，并落入项目 `TODO.md`；`pi-workmap` 是 session-scoped typed map，默认不创建项目级 todo artifact。

### `@plannotator/pi-extension`

- 链接：[Pi package — `@plannotator/pi-extension`](https://pi.dev/packages/%40plannotator/pi-extension)、[GitHub — backnotprop/plannotator](https://github.com/backnotprop/plannotator)
- 可借鉴点：稳定的 Markdown review artifact、inline annotation、revision history、显式 approve/deny 与 plan diff，适合研究 human 如何纠正 Agent 方案。
- 差异：Plannotator 是同步点 + approval gate；`pi-workmap` 默认是持续更新 + passive awareness，只对少数高影响 decision 提示或阻塞。

## Working memory、shared artifacts 与 durable state

### `pi-continuous-orchestration`

- 链接：[Pi package — `pi-continuous-orchestration`](https://pi.dev/packages/pi-continuous-orchestration)
- 可借鉴点：在 `.pi/meta/` 中维护 `GOAL.md`、`LEDGER.md`、`STATUS.md`、`ROADMAP.md`，覆盖目标、约束、证据、失败方案、blocker、remaining gaps 与里程碑。
- 差异：这些文件主要是 Agent 的 durable working memory 与长期自主执行基础；`pi-workmap` 首先服务 human 的实时 situation awareness，生命周期默认只到当前 session。

### `amutix`

- 链接：[GitHub — amutix/amutix](https://github.com/amutix/amutix)、[Pi package — `amutix`](https://pi.dev/packages/amutix)
- 可借鉴点：把 goal、constraints、direction、backlog、journal、roles 与 handoff 组织为 shared source of truth，并强调文件支持的团队协调状态。
- 差异：`amutix` 面向多 Agent、项目级 durable coordination；`pi-workmap` 面向一个 human 与当前 session Agent 的认知同步，不承担团队资源、ownership 或长期 backlog。

### `@capyup/pi-specs`

- 链接：[Pi package — `@capyup/pi-specs`](https://pi.dev/packages/%40capyup/pi-specs)、[GitHub — capyup/pi-specs](https://github.com/capyup/pi-specs)
- 可借鉴点：清楚区分 durable product/technical specs、research evidence、implementation milestones 与 session working state；也展示了 focused spec widget 的信息密度。
- 差异：`pi-specs` 产出项目级、可评审的 durable artifacts，并明确不负责 progress management；`pi-workmap` 正好服务其刻意留给 session 的动态状态。

### `pi-chronicle`

- 链接：[Pi package — `pi-chronicle`](https://pi.dev/packages/pi-chronicle)、[GitHub — eiei114/pi-chronicle](https://github.com/eiei114/pi-chronicle)
- 可借鉴点：有意识地记录 decision、blocker、milestone、try 与 revert，而不是复制自动 transcript；typed beats 很适合作为 session 变化事件的参考。
- 差异：Chronicle 是按时间积累、最终写入 vault 的叙事素材；`pi-workmap` 是按问题结构组织的当前状态，旧事件只在仍有解释价值时保留。

### `@nikiforovall/pi-scratchpad`

- 链接：[Pi package — `@nikiforovall/pi-scratchpad`](https://pi.dev/packages/%40nikiforovall/pi-scratchpad)、[文章 — scratch: Structured Scratchpads for Coding Agents](https://nikiforovall.blog/ai/2026/06/08/scratch.html)
- 可借鉴点：明确区分 temporary knowledge 与 project knowledge；用 folder + manifest 组织 notes、research、decisions、command output 和中间 artifacts，并提供 read-only viewer。`planning-with-scratchpad` 也证明长任务需要显式外部 working memory。
- 差异：Scratchpad 更像 Agent 整理的一摞临时材料；`pi-workmap` 更像双方一直看得到、结构受限且持续更新的白板。

### `convergent`

- 链接：[Pi package — `convergent`](https://pi.dev/packages/convergent)、[GitHub — lostinpatterns/convergent](https://github.com/lostinpatterns/convergent)
- 可借鉴点：要求 Agent externalize its mental model 为 plan/spec/design Markdown，human annotate、Agent revise，直到明确 approval；非常直接地解决 alignment 与 stable review surface。
- 差异：Convergent 在 implementation 前建立明确 review loop 和 authority boundary；`pi-workmap` 贯穿 investigation、implementation 与 test，目标是不中断自治也能保持 common ground。

### `@yishan-io/pi-dev-flow` — whiteboard

- 链接：[Pi package — `@yishan-io/pi-dev-flow`](https://pi.dev/packages/%40yishan-io/pi-dev-flow)
- 可借鉴点：whiteboard skill 以 Excalidraw scene 支持 ideation、architecture 与自由视觉表达，验证了 human–Agent 共用临时视觉空间的隐喻。
- 差异：它的 whiteboard 是 boxes/arrows/diagram editor；`pi-workmap` 是 typed、自动维护、适合 TUI 扫读的 live tree，不要求 human 进行画布布局。

## 概念与研究背景

### Situation awareness

- 链接：[Endsley, “Toward a Theory of Situation Awareness in Dynamic Systems”](https://doi.org/10.1518/001872095779049543)
- 可借鉴点：将 situation awareness 组织为对环境要素的 perception、对其意义的 comprehension，以及对未来状态的 projection。
- 对产品的启发：Workmap 不应只显示 Agent 当前动作，还应显示动作的意义、关键依据和下一步可能走向。

### Situation Awareness-based Agent Transparency (SAT)

- 链接：[Chen et al., “Situation awareness-based agent transparency and human-autonomy teaming effectiveness”](https://doi.org/10.1080/1463922X.2017.1315750)
- 可借鉴点：把 transparency 分为 Agent 当前 actions/plans、reasoning/rationale，以及 projected outcomes/uncertainty，并强调双向沟通与 calibrated trust。
- 对产品的启发：Heading/Task、Understanding/Decision rationale、hypothesis/Projection 可分别覆盖这些信息层；但 UI 必须控制信息量，避免 transparency 变成噪声。

### Common ground / grounding

- 链接：[Clark & Brennan, “Grounding in Communication”](https://doi.org/10.1037/10096-006)
- 可借鉴点：协作沟通依赖参与者建立、确认并修复 common ground，而不是假设信息一经说出就已经共享。
- 对产品的启发：节点要可见、可纠正，并允许 human 的修正改变 Agent 后续上下文；单向状态 dump 不等于 shared map。

### Shared mental models in human–AI teams

- 链接：[“The role of shared mental models in human-AI teams: a theoretical review”](https://doi.org/10.1080/1463922X.2022.2061080)、[“Shared Mental Models in Human-Machine Systems”](https://doi.org/10.1016/j.ifacol.2016.10.517)
- 可借鉴点：共同理解能支撑团队预测、协调与问题解决；human–AI teaming 需要考虑模型如何形成、更新和校准，而不只是解释单个输出。
- 对产品的启发：Workmap 应是随工作演化的协作结构，而不是完成后才生成的 explanation。

### Out-of-the-loop performance problem

- 链接：[Endsley & Kiris, “The Out-of-the-Loop Performance Problem and Level of Control in Automation”](https://doi.org/10.1518/001872095779064555)
- 可借鉴点：自动化可能让操作者从主动处理变为被动监控，降低 situation awareness，并在需要接管时付出代价。
- 对产品的启发：目标不是增加逐步审批，而是在 Agent 自治期间持续提供足以理解和接管的 shared state。

### Premature commitment / design fixation

- 链接：[Purcell & Gero, “Design and other types of fixation”](https://doi.org/10.1016/S0142-694X%2896%2900023-3)
- 可借鉴点：设计问题中对一个方案的过早承诺会压缩探索空间，并造成 fixation。
- 对产品的启发：显式展示 Unknown、Option 与 trade-off，可以在高成本实现发生前暴露未经检验的路线锁定。

## 综合定位

相关项目已经分别证明了 task widget、DAG plan、tree todo、session outline、scratchpad、durable orchestration memory、shared Markdown review 与 visual whiteboard 的价值。`pi-workmap` 的空位是把这些思想收敛为：

> 当前 session 中，human 与 Agent 共同可见、持续更新、可纠正的 typed working model。

它不取代上述工具；它连接 task visibility 与 shared understanding 之间仍然缺失的一层。
