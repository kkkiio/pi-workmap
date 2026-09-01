# pi-workmap

![pi-workmap runtime widget](docs/assets/workmap-session.png)

`pi-workmap` is a Pi extension maintained proactively by the LLM Agent. It distills the Agent's current goal, understandings, decisions, actions, and detected drift into a persistent workmap you can scan at any time; when something looks off, correct it in conversation and the Agent updates both the map and its course.

## Installation

Local installation:

```bash
pi install .
```

## Usage

The Agent calls the `workmap` tool whenever its working model materially changes; once the map has content, a full workmap of at most 10 signals stays pinned above the editor — what you see is everything the Agent has declared. When the map fills up, the oldest subtree automatically gives way to newer information; updates never fail with a capacity error.

The bundled `/workmap-tidy` prompt template asks the Agent to reconcile the workmap against the latest direction and progress: refresh the heading, drop stale signals, and close out resolved drift and decisions.

## Session behavior

- Every `/tree` branch in the same session file shares the latest workmap; switching branches never rolls it back.
- `resume` restores the session's latest workmap.
- `fork` inherits the current workmap, then evolves independently from the parent session.
- A `new session` starts with an empty workmap.
