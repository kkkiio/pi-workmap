# ADR 0020: option 只做 decision 的子节点

- Status: Accepted
- Date: 2026-09-17

## Context

`option` 的语义是某个 decision 下的备选，但 schema 一直允许它在任何位置。措辞层面的"option 归位"到 ADR 0014/0017 才写清：旧语料出现 128 行 root option（123 行来自同一版 schema 的两场 session），v7 的 357 份快照里为 0——措辞生效了，schema 却仍在宣称它合法。

## Decision

1. **拆分 type union**：root 只接受 understanding / decision / task / drift；child 仍接受五种。
2. **父节点规则由校验兜**：非 decision 的 root 下出现 option 时整次拒绝（`Options only belong under a decision — …`）。用 schema 表达需要在每种 root 上重复一份 child union，代价是每个请求多约 1 KB。
3. **`literal()` 泛型化**：每个 literal 保留自己的名字类型，使 `WorkmapRoot` 的静态类型同样不含 `option`，而不是只在运行时被拒。类型描述集中为一份 `TYPE_DESCRIPTIONS`，父/子层措辞不会漂移。
4. **拒绝文案点明规则**：`…check types, titles, labels, depth, and that an option sits under its decision`。
5. **不做恢复期迁移**：旧快照里的 root option 校验失败后按既有规则回退到上一份有效状态（实测 v7 无此情况）。

## Rationale

判据是 schema 是模型学习域模型的通道：root union 里列出 `option` 等于错误陈述域，而旧语料正因此产生了 128 次误用。措辞能改行为，schema 与校验定义合法空间，且零 token 成本。这与 ADR 0011 不冲突——该失败已被观察到，只是被后来的措辞掩盖。

## Consequences

- `test/agent-surface.test.ts` 快照更新；`test/state.test.ts` 覆盖两种误写：root option、挂在 task 下的 option。
- root 与 child 的重叠从 5 个 type literal 降到 4 个。
