# ADR 0012: Glyph 宽度以 ghostty 环境的实测对齐为准

- Status: Accepted
- Date: 2026-09-01

## Context

widget 的对齐机制建立在"每个 glyph 单元占满两个终端列"的算术上（`glyphCell` 用 pi-tui 的 `visibleWidth` 计算补空格数）。这套算术有一个隐含假设：**pi-tui 算出的宽度与模拟器实际渲染的格子数一致**。一旦不一致——pi-tui 算 1 格、模拟器画 2 格——该行标题右移一列，tree 连接线与 status 列全部错位。

宽度风险与 Unicode 的 East Asian Width 档位并不完全对应：当前清单同时包含 Neutral（`⎇` `✦`）、Ambiguous（`◎` `◆` `◇` `•`）与 Wide（`⚡`）字符。Ambiguous 档由各模拟器自行裁决、风险最高；但 pi-tui 的宽度表与模拟器的实现也可能在任何档位上出现出入，不能凭档位免检。替换 drift glyph（`⚡` → `⎇`）时必须先回答“ghostty 会把它画成几格”。

实测方法:向模拟器打印字符后发送 DSR(`ESC[6n`),模拟器回报光标列,列差即单元格宽度。此答案出自真正画格子的那一方,不需要截肉眼比对。2026-09-01 在 Ghostty 1.3.1 与 tmux 3.7b 中实测：`⎇` / `✦` / `⑂` / `⅄` / `•` / `◎` 均为 1 格，`⚡` / `中` 均为 2 格——ghostty 与 tmux 的裁决与 pi-tui 的 `visibleWidth` 三方一致。

## Decision

glyph 的选用规则：**无论 EAW 档位，候选字形一律在实际运行环境（ghostty 直跑、tmux 套 ghostty）中用 DSR 实测格子宽度，与 pi-tui 的 `visibleWidth` 一致才可采用**。档位分类只作风险提示，不作免检依据。

当前清单的实测结论：`✦ ◎ • ◆ ◇ ⎇` 为 1 格，`glyphCell` 补 1 空格凑满 2 列；`⎇` 作为 drift glyph 保留（分支语义贴切，备选 `⑂` U+2442、`⅄` U+2144 同为 1 格）。

## Rationale

**对齐错位是成片的，不是局部的。** 一个 glyph 宽度算错只影响它自己那一行的视觉对齐，但 status 右对齐与 tree 缩进都以列为锚，一行错位即破坏整个 widget 的网格感。而宽度不一致恰恰无法靠使用中观察到——用户看到的是"有点歪"，不会报 bug。因此唯一的防线在选型时：把"模拟器说了算"当成事实来源，用模拟器自己的光标回报机制取证，而不是信任任何一方的宽度表。

字体不改变格子数：缺字时模拟器 fallback 到其他字体渲染，占格仍由模拟器的宽度表决定，所以"换个字体"不能替代实测。

## Consequences

- 引入任何新 glyph（或 pi-tui 更换宽度实现、ghostty 更改宽度裁决）时，重跑 DSR 实测——成本低（一次打印 + 一次光标上报），不做档位豁免。
- `⎇` 在 JetBrains Mono 字库内不存在，真机 ghostty 与截图管线（Freeze 的 rsvg 后端）都由系统回退字体（STIX Two Math）渲染，二者行为一致、风格可接受；更换截囗字体或升级系统后需重新比对。
- `ambiguous = wide` 类配置（如 iTerm2 的对应选项）下所有 Ambiguous 字形都会错位，这是环境的固有行为，不做兼容；ghostty 默认行为是基准。
- 实测脚本是一次性 throwaway（打印字符 + `ESC[6n` + 读回报），不进入仓库；需要时按本 ADR 的方法重建。
