# pi-workmap AGENTS.md

## Project Structure Guide

### Repo Structure & Important Files

```text
.
├── AGENTS.md                         # Repository-wide developer-agent rules
├── README.md                         # User-facing installation and usage
├── package.json                      # Pi package manifest and development commands
├── src/
│   ├── index.ts                      # Extension lifecycle, tools, and state message injection
│   ├── node-types.ts                 # Node type semantics, per-type status vocabulary, invariants
│   ├── session-entry.ts              # Snapshot wire format and session-file persistence
│   ├── context-message.ts            # Persisted workmap-state message rendering
│   ├── state.ts                      # Validated session-global snapshots
│   ├── types.ts                      # Public workmap data types
│   └── widget.ts                     # Full-tree persistent TUI widget
├── test/
│   ├── state.test.ts                 # State and persistence semantics
│   ├── widget.test.ts                # Width-aware widget behavior
│   └── visual/                       # Real Pi TUI screenshot fixture and capture tooling
└── docs/
    ├── adr/                          # Architecture decision records
    ├── assets/                       # README runtime screenshot (single full-tree view)
    ├── concept.md                    # Core problem, selection principle, design principles
    ├── product-boundary.md           # Session working state vs durable knowledge; non-goals
    ├── ui.md                         # Widget visual language, examples, and layout rules
    ├── open-questions.md             # Hypotheses still awaiting validation through real use
    └── research.md                   # Related work and literature
```

Keep session semantics in `src/state.ts`, presentation in `src/widget.ts`, and Pi integration in `src/index.ts`. Do not add another storage or UI layer for behavior already owned by those modules.

## Domain Language

- **Workmap** — The Agent's concise, user-visible declaration of its current operational mental model for one Pi session.
- **Mental model** — Each party's internal representation of the work. The gap between the user's and the Agent's is the problem; mental models are not directly shareable.
- **Shared working model** — Provisional common ground created when the user can inspect and correct the Agent's declared workmap.
- **Signal** — One typed workmap node that materially helps the user understand or correct the Agent's direction.
- **Heading** — The Agent's best present reading of what the user wants; the anchor every other signal is measured against. A corrected heading is a reward, so declare it early even at low confidence. It names the destination, never the route (routes are Decisions). Re-examine at every phase shift and after every correction: update when understanding changed, even if the user's words did not.
- **Understanding** — A fact, synthesis, inference, or hypothesis the Agent currently uses. Mark unverified premises explicitly as `hypothesis` rather than stating them as fact.
- **Decision** — A choice being deliberated or a commitment already made. Title it as a question while deliberating; once decided, append the conclusion to the title ("…? → conclusion") rather than rewriting it.
- **Option** — A considered alternative for a Decision. A tentative answer to an open question is an Understanding with status `hypothesis`, not an Option.
- **Task** — An action the Agent declares it intends, is doing, or has done; a `done` title records side effects (what changed, what ran), serving as the map's recent behavior ledger. One level of children expresses supporting structure only, never execution tracking (dependencies, progress rollups, or completion archives). Factual questions get no node type: investigate directly, or ask the user in conversation when only they can answer.
- **Drift** — A detected mismatch between the Agent's direction and user intent or the declared workmap.

Status labels are type-scoped; the recommended vocabulary per type lives in `src/node-types.ts` (heading: current/long-term; decision: considering/chosen; understanding: hypothesis; task: pending/active/done). The map is capped at 10 nodes (children included); a non-empty map must carry a `current` and a `long-term` heading — violations and over-capacity sets are rejected whole, never silently pruned (ADR 0015).

## Policies & Mandatory Rules

### Compatibility and documentation

- When changing runtime code during the `0.x` phase, prefer a direct schema migration over compatibility layers unless released session data would become unreadable.
- When implementation changes product intent, update the relevant file in `docs/` in the same change; keep README focused on installation and first use.

## Operation Guide

Use Node.js 22 or newer and install dependencies with:

```bash
npm install
```

When changing `src/` or `test/`, run the complete check suite:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Skip the check suite for Markdown-only changes unless links, screenshots, or generated artifacts changed.

When changing widget rendering or the README scenario, regenerate the real Pi TUI screenshots. The default path captures ANSI from a real Pi process in `tmux` and renders it with Charmbracelet Freeze:

```bash
brew install tmux charmbracelet/tap/freeze librsvg
npm run docs:screenshot
```

Freeze needs `rsvg-convert` for system-font fallback (otherwise glyphs missing from its embedded JetBrains Mono render as tofu), and JetBrains Mono must be registered with the OS via Font Book — on recent macOS the cask copies files without registering them.

Capture details and pinned visual settings live in `test/visual/README.md` and `test/visual/freeze.json`.

Run the unpublished extension directly in Pi with:

```bash
pi --no-extensions --extension ./src/index.ts
```
