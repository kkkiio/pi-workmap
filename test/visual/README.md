# Visual fixtures

The documentation screenshots come from a real Pi process, not a hand-built UI mock. The capture script opens the checked-in session fixture in an isolated `tmux` pane, loads the extension from `src/`, types the editor text, and waits for Pi to render the persistent widget.

The default renderer follows Charmbracelet Freeze's recommended TUI pipeline:

```text
Pi TUI → tmux capture-pane -p -e → Freeze → docs/assets/*.png
```

## Generate screenshots

Install the external tools first. On macOS:

```bash
brew install tmux charmbracelet/tap/freeze librsvg
```

`librsvg` provides `rsvg-convert`, which Freeze uses as its PNG backend; without it Freeze falls back to its embedded font database that resolves no system fonts, and glyphs missing from embedded JetBrains Mono (for example the drift glyph `⎇`) render as tofu.

`rsvg-convert` resolves fonts through CoreText, so JetBrains Mono must be **registered with the OS**, not merely present in `~/Library/Fonts`: on recent macOS, `brew install --cask font-jetbrains-mono` copies the files but does not register them (Font Book shows nothing and pango falls back to a proportional font). Open one of the files in Font Book and install it once; verify with `ghostty +show-face --cp=0x21A6` reporting `JetBrains Mono`.

Then regenerate the runtime screenshot:

```bash
npm run docs:screenshot
```

The Freeze window, font, spacing, and background are pinned in `freeze.json`; the script does not read a user's personal Freeze configuration. Set `FREEZE_BIN` when the executable is not on `PATH`.

The command reuses `fixtures/workmap-session.jsonl` and overwrites both documentation assets.
