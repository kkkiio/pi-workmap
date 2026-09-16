# pi-workmap

![pi-workmap runtime widget](docs/assets/workmap-session.png)

> **See what your agent intends before it acts — and why.**

`pi-workmap` is a Pi extension maintained proactively by the LLM Agent. It distills the Agent's current direction, understandings, decisions, actions, and detected drift into a persistent workmap you can scan at any time; when something looks off, correct it in conversation and the Agent updates both the map and its course.

## Installation

Local installation:

```bash
pi install .
```

## Usage

Once the Agent starts working, a workmap stays pinned above the editor:

```text
✦ Keep users signed in reliably
⎇ The client-only fix assumes a single worker                  detected
• Refresh requests occasionally overlap                       observed
◎ Check whether the refresh race can cross workers              active
└─ ◎ Trace worker IDs on concurrent refreshes                   active
◆ Where should refresh serialization live?                considering
├─ ◇ Serialize in the client                                  candidate
└─ ◇ Make refresh idempotent on the server                    preferred
```

- The Agent declares the goal with `set_goal` and keeps the signals current with `restate` — a new finding or suspicion goes up before the Agent acts on it. A mid-task course change is reported on the spot via `add_drift`, directly below the goal.
- Something looks off? Say so in conversation — the Agent updates the map and its course.
- The goal stays stable across signal rewrites. The map holds at most 10 nodes, including the goal and children.

## Session behavior

- Every `/tree` branch in the same session file shares the latest workmap; switching branches never rolls it back.
- `resume` restores the session's latest workmap.
- `fork` inherits the current workmap, then evolves independently from the parent session.
- A `new session` starts with an empty workmap.
