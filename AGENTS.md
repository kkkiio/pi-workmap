# pi-workmap AGENTS.md

## Project Structure Guide

### Repo Structure & Important Files

```text
.
├── AGENTS.md                         # Repository-wide developer-agent rules
├── AGENTS.local.md                   # Local paths to reference implementations
├── README.md                         # User-facing installation and usage
├── package.json                      # Pi package manifest and development commands
├── src/
│   ├── index.ts                      # Extension lifecycle, tool, and context injection
│   ├── state.ts                      # Validated session-global snapshots
│   ├── types.ts                      # Public workmap data types
│   └── widget.ts                     # Compact/expanded persistent TUI widget
├── test/
│   ├── state.test.ts                 # State and persistence semantics
│   ├── widget.test.ts                # Width-aware widget behavior
│   └── visual/                       # Real Pi TUI screenshot fixture and capture tooling
└── docs/
    ├── assets/workmap-session.png    # README runtime screenshot
    └── *.md                          # Product concepts, boundaries, UI, and references
```

Keep session semantics in `src/state.ts`, presentation in `src/widget.ts`, and Pi integration in `src/index.ts`. Do not add another storage or UI layer for behavior already owned by those modules.

## Domain Language

- **Workmap** — The Agent's concise, user-visible declaration of its current operational mental model for one Pi session.
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
- **Session-global** — The latest workmap is shared by every `/tree` branch in one session file.

## Policies & Mandatory Rules

### Product invariants

- When changing the node model, keep exactly `goal`, `understanding`, `unknown`, `decision`, `option`, `task`, and `drift` unless the user explicitly revises the product model.
- When representing blocked work, use a Task's free-form `status` and `note`; do not reintroduce a Blocker node.
- When representing a long-term outcome relevant to this session, use Goal with a `long-term` status; do not add `LongTermGoal` or cross-session memory.
- When adding relationships, keep `parentId` as the only V1 relationship; do not add refs, DAG rendering, Workstream, or mandatory Goal ownership.
- When changing Agent guidance, preserve proactive maintenance, current-state pruning, semantic snake_case IDs, and the prohibition on chain-of-thought capture.
- When changing human interaction, keep the widget display-only and let the user correct it through conversation; do not add approval gates or an editor without an explicit product decision.

### Session and UI invariants

- When restoring state, scan `getEntries()` for the latest valid snapshot so `/tree` does not roll the workmap back.
- When handling fork, copy the current in-memory workmap into the new session and let parent and fork evolve independently.
- When changing compact/expanded behavior, read and set Pi's official tool expansion state; do not register a competing hard-coded shortcut.
- When rendering TUI content, use Pi theme tokens and width-aware utilities, keep status right-aligned only when it fits, and hide the widget when empty.

### Compatibility and documentation

- When changing runtime code during the `0.x` phase, prefer a direct schema migration over compatibility layers unless released session data would become unreadable.
- When implementation changes product intent, update the relevant file in `docs/` in the same change; keep README focused on installation and first use.
- When an implementation constraint forces a temporary deviation from these invariants, record it under `.agents/drift-notes/<topic>.md` and remove the note after resolution.

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
