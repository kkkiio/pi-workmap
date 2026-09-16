# ADR 0019: signal 与 node 的口径统一，并去掉 widget header

- Status: Accepted（取代 [ADR 0015](0015-full-rewrite-set-add-drift-two-layer.md) 的高度契约"header + ≤10 行"）
- Date: 2026-09-17

## Context

"signal"长期两义：结构与 [AGENTS.md](../../AGENTS.md) 的 Goal 条目把它排除在外（`WorkmapSchema = { goal?, nodes }`，goal 不在五个 type 里），而容量报错与 UI 文案把它计入。`restate` 只接收 `nodes`，需要一个能整批指代该集合的词。

## Decision

1. **signal = 五种 typed node，不含 goal**；计数与容量统一用 node（`Updated workmap · N nodes`、容量报错改为 "10 nodes"）。
2. **删除 widget header**（原 `Workmap · N nodes · M drift`）：widget 只有一棵完整树，第一行就是 goal 行。
3. **drift 的显著性改由行承载**（紧随 goal + error 色）；`docs/ui.md` 原"header 的 drift 计数"规则随之改写。

## Rationale

- signal 必须能整批指代 `restate` 写入的集合；"一行"的中性词本来就有——node。选另一口径则每处都要带"除 goal 之外"的限定。
- header 是被扫过几十次的表面，信息几乎不变，属于 `docs/ui.md` 自己反对的重复阅读成本。

## Consequences

- 高度契约：`header + ≤10 行` → `≤10 行`。
- 同步更新 widget 快照、README 截图与示例、`docs/ui.md`、`test/visual/capture.ts`（改用 goal 标题作定位标记）。
- 容量数字不再常驻屏幕；超限仍由写入拒绝与工具结果体现。
