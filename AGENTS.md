# pi-workmap AGENTS.md

## Project Structure Guide

### Repo Structure & Important Files

```text
.
├── AGENTS.md                         # Repository-wide developer-agent rules
├── README.md                         # User-facing installation and usage
├── package.json                      # Pi package manifest and development commands
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
- **Goal** — An intended outcome that currently constrains the Agent's direction.
- **Understanding** — A fact, synthesis, inference, or hypothesis the Agent currently uses.
- **Unknown** — A factual question that investigation or evidence can answer.
- **Decision** — A choice being deliberated or a commitment already made; write it as a noun phrase or declarative conclusion, not a question.
- **Option** — A considered alternative for a Decision, not a possible answer to an Unknown.
- **Task** — A current action implied by the working model, not the organizing center of the product.
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

When changing widget rendering or the README scenario, regenerate the real Pi TUI screenshot. This requires `tmux` and Chrome or Chromium:

```bash
npm run docs:screenshot
```

Run the unpublished extension directly in Pi with:

```bash
pi --no-extensions --extension ./src/index.ts
```
