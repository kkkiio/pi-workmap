# ADR 0018: status 字段改名 label

- Status: Accepted（措辞层字段更名，与 [ADR 0017](0017-set-goal-tool.md) 共享快照 v7 迁移；[ADR 0015](0015-full-rewrite-set-add-drift-two-layer.md) 的校验分层不受影响）
- Date: 2026-09-06

## Context

- **名实不符**：schema description 从一开始就写 "Optional restrained right-side label"，字段却叫 `status`——名字在撒谎。
- **"status" 的生命周期先验与措辞层定位对着干**：ADR 0015 已裁定 status 的词表是措辞、永不立法，但 "status" 这个词自带的进展/状态机先验持续召唤状态词——session 数据的病灶（goal|done 17 次、understanding|done 11 次、confirmed 55 次顶掉整个推荐词表）都是状态词入侵非 task 类型。`label` 对生命周期中性，表达的就是它被设计的语义：右对齐的标注。
- **趁未发布改名成本最低**；与 ADR 0017 捆绑为同一次 v7 迁移，不付两次成本。

## Decision

1. 节点字段 `status` → `label`；语义不变：自由字符串 ≤24、右对齐 dim 渲染、词表归措辞层（decision considering/chosen；understanding confirmed/inferred/hypothesis；task pending/active/done）。
2. 涉及面：schema 字段、state 校验错误文案、快照与 tool details 字段、widget/context-message 渲染、guidelines 措辞（"label considering…" 句式，见 ADR 0017 的定稿 guidelines）。
3. 快照 v7 一次性迁移 v6→v7：goal 根节点提取（ADR 0017）+ 字段改名，同一函数完成。

## Consequences

- 纯改名，无行为变化的承诺；预期收益是生命周期词入侵减少——列入 open-questions 观察，词例随先验调整。
- `add_drift` 的自动标注 `detected` 语义不变，字段名随改。
- 校验分层不受影响：label 仍是自由格式，永不立法。
