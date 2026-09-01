# pi-workmap AGENTS.md

## Project Structure Guide

### Repo Structure & Important Files

```text
.
├── AGENTS.md                         # Repository-wide developer-agent rules
├── README.md                         # User-facing installation and usage
├── package.json                      # Pi package manifest and development commands
├── prompts/
│   └── workmap-tidy.md               # /workmap-tidy prompt template for workmap housekeeping
├── src/
│   ├── index.ts                      # Extension lifecycle, tool, and state message injection
│   ├── context-message.ts            # Persisted workmap-state message rendering
│   ├── state.ts                      # Validated session-global snapshots
│   ├── types.ts                      # Public workmap data types
│   └── widget.ts                     # Compact/expanded persistent TUI widget
├── test/
│   ├── state.test.ts                 # State and persistence semantics
│   ├── widget.test.ts                # Width-aware widget behavior
│   └── visual/                       # Real Pi TUI screenshot fixture and capture tooling
└── docs/
    ├── adr/                          # Architecture decision records
    ├── assets/                       # README runtime screenshots (compact / expanded)
    └── *.md                          # Product concepts, boundaries, UI, and references
```

Keep session semantics in `src/state.ts`, presentation in `src/widget.ts`, and Pi integration in `src/index.ts`. Do not add another storage or UI layer for behavior already owned by those modules.

## Domain Language

- **Workmap** — The Agent's concise, user-visible declaration of its current operational mental model for one Pi session.
- **Mental model** — Each party's internal representation of the work. The gap between the user's and the Agent's is the problem; mental models are not directly shareable.
- **Shared working model** — Provisional common ground created when the user can inspect and correct the Agent's declared workmap.
- **Signal** — One typed workmap node that materially helps the user understand or correct the Agent's direction.
- **Heading** — The Agent's best present reading of what the user wants; the anchor every other signal is measured against. Reporting a heading is telemetry, not testimony: a corrected heading is a success event, so declare it early even at low confidence. It names the destination, never the route (routes are Decisions). Re-examine at every phase shift and after every correction: update when understanding changed, even if the user's words did not.
- **Understanding** — A fact, synthesis, inference, or hypothesis the Agent currently uses. Mark unverified premises explicitly as `hypothesis` rather than stating them as fact.
- **Decision** — A choice being deliberated or a commitment already made. Title it as a question while deliberating; once decided, append the conclusion to the title ("…? → conclusion") rather than rewriting it.
- **Option** — A considered alternative for a Decision. A tentative answer to an open question is an Understanding with status `hypothesis`, not an Option.
- **Task** — A current action implied by the working model, not the organizing center of the product. Tasks may nest for grouping; nesting expresses information structure only, never execution tracking (dependencies, progress rollups, or completion archives). Factual questions get no node type: investigate directly, or ask the user in conversation when only they can answer.
- **Drift** — A detected mismatch between the Agent's direction and user intent or the declared workmap.
- **Note** — An optional one- or two-sentence explanation that materially improves alignment.

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
brew install tmux charmbracelet/tap/freeze
npm run docs:screenshot
```

Capture details and pinned visual settings live in `test/visual/README.md` and `test/visual/freeze.json`.

Run the unpublished extension directly in Pi with:

```bash
pi --no-extensions --extension ./src/index.ts
```
