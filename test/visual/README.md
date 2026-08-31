# Visual fixtures

The documentation screenshots come from a real Pi process, not a hand-built UI mock. The capture script opens the checked-in session fixture in an isolated `tmux` pane, loads the extension from `src/`, types the editor text, and waits for Pi to render the persistent widget.

The default renderer follows Charmbracelet Freeze's recommended TUI pipeline:

```text
Pi TUI → tmux capture-pane -p -e → Freeze → docs/assets/*.png
```

## Generate screenshots

Install the two external tools first. On macOS:

```bash
brew install tmux charmbracelet/tap/freeze
```

Then regenerate both compact and expanded screenshots:

```bash
npm run docs:screenshot
```

The Freeze window, font, spacing, and background are pinned in `freeze.json`; the script does not read a user's personal Freeze configuration. Set `FREEZE_BIN` when the executable is not on `PATH`.

The command reuses `fixtures/workmap-session.jsonl` and overwrites both documentation assets.
