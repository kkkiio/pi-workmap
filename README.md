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
✦ Stop random logouts                                          long-term
Workmap · 8 signals
⎇ The client-only fix assumes a single worker                  detected
◆ Where should refresh serialization live?                     considering
├─ ◇ Serialize in the client                                   candidate
├─ ◇ Make refresh idempotent on the server
└─ ◎ Compare approaches                                        active
• Refresh requests occasionally overlap                        observed
◎ Reproduce the double logout (rewrote 2 fixtures)             done
◎ Ship the flaky-auth regression test                          active
```

- Every prompt, before acting, the Agent re-declares the complete signal map; the goal is distilled separately via `set_goal`, rendered as the header, and stable across rewrites; a mid-task course change is reported on the spot via `add_drift`, rendered directly below the goal.
- Something looks off? Say so in conversation — the Agent updates the map and its course.
- Hard limits, enforced by rejection: at most 8 signals per declaration with ≤4 children each, and at most 10 signals in total (children included).

## Session behavior

- Every `/tree` branch in the same session file shares the latest workmap; switching branches never rolls it back.
- `resume` restores the session's latest workmap.
- `fork` inherits the current workmap, then evolves independently from the parent session.
- A `new session` starts with an empty workmap.
