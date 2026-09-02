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
Workmap · 9 signals
✦ Keep the auth layer trustworthy                             long-term
✦ Fix the flaky auth test
• Refresh requests occasionally overlap                       observed
◆ Where should refresh serialization live?                considering
├─ ◇ Serialize in the client                                  candidate
├─ ◇ Make refresh idempotent on the server
└─ ◎ Compare approaches                                       active
◎ Reproduce the double logout (rewrote 2 fixtures)             done
⎇ The client-only fix assumes a single worker                  detected
```

- Every prompt, before acting, the Agent re-declares this complete map; a mid-task course change is appended on the spot via `add_drift`.
- Something looks off? Say so in conversation — the Agent updates the map and its course.
- Hard limits, enforced by rejection: at most 10 signals, every map anchored by a `long-term` heading.

## Session behavior

- Every `/tree` branch in the same session file shares the latest workmap; switching branches never rolls it back.
- `resume` restores the session's latest workmap.
- `fork` inherits the current workmap, then evolves independently from the parent session.
- A `new session` starts with an empty workmap.
