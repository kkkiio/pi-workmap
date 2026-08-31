# ADR 0009: Heading root 始终置顶

- Status: Accepted
- Date: 2026-08-31

## Context

Workmap 的展示顺序此前完全由插入顺序决定（新节点追加到末尾）。这意味着后来才声明的 heading 会沉到列表底部——而 heading 是全图的锚：技术文档把 Goals 小节放在开头，因为锚先于细节，读者需要先知道"要去哪"才能评估其余一切。

## Decision

在 expanded widget 与注入的 context 快照中，`heading` 类型的 root 节点始终渲染在最前（多个 heading 之间仍按插入顺序），其余 root 保持插入顺序不变。compact 模式已由簇优先级自然置顶 heading（ADR 0007），无需变化。

## Rationale

插入顺序保留时间信息，对大多数类型是对的；但 heading 的特殊性在于它是其他节点的**评价基准**——用户扫读时的第一问永远是"方向对不对"，然后才是其他节点在这个方向下是否成立。置顶把"先校准锚，再读图"的阅读顺序固化进渲染，而不是依赖 Agent 记得最先写它。

## Consequences

- `docs/data-model.md` 的"更新保留显示位置"规则增加一条显式例外。
- 仅影响展示层；持久化 state 的顺序语义不变。
