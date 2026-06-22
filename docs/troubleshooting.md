# Troubleshooting

Most Orbital issues come down to the pane not being open, the active note, or an
exclusion pattern hiding something. Work through the common issues below, then gather
debug information if you still need help.

## Common issues

### The Orbital pane won't open

- Confirm Orbital is enabled under **Settings → Community plugins**.
- Run **Orbital: Open** from the command palette — the pane opens in the right sidebar.
- If it still doesn't appear, reload Obsidian and try again.

### The Relations tab is empty

The Relations tab always reflects the **active note**. Click into a note to populate
it. The empty state (no note open) is expected, not a bug.

### A note is missing from Recent, Relations, or Unlinked mentions

The note probably matches an exclusion. Check **Settings → Orbital → Advanced →
Exclude path patterns** and **Exclude tag patterns** — a path or tag pattern there
hides matching notes across all three surfaces. Clear or adjust the pattern to bring
the note back. (An invalid regex is silently ignored, so a typo'd pattern simply
matches nothing.)

### Unlinked mentions is empty or slow to load

The Unlinked mentions section scans note contents **on demand** when you expand it, so
the first open in a large vault can take a moment. Make sure **Show unlinked mentions**
is on (Settings → Orbital → Relations).

### The 2nd-hop / Related list looks cut off

It's capped. Raise **Second-hop cap** (Settings → Orbital → Relations) to show more, or
disable **Second-hop links** if you don't need them.

### The status-bar item is missing

Enable **Show status bar item** in **Settings → Orbital** (it's near the top of the tab).

### A dangling-link action did something unexpected

Rename, change-to-alias, create, and delete rewrite files and **cannot be undone** —
each dialog warns you first. If a change was wrong, restore the affected notes from a
backup or Obsidian's file recovery. Always read the preview (occurrence and file
counts) before confirming.

## Debug information

When something misbehaves, capture detail before reporting:

1. Turn on **Settings → Orbital → Advanced → Debug logging**.
2. Open the developer console (Toggle Developer Tools — `Ctrl+Shift+I` on
   Windows/Linux, `Cmd+Option+I` on macOS) and select the **Console** tab.
3. Reproduce the problem and look for lines prefixed with `[Orbital]`.

Turn Debug logging back off afterwards — it's verbose.

## Getting help

If the steps above don't resolve it, open an issue at
[github.com/MMoMM-org/obsidian-orbital/issues](https://github.com/MMoMM-org/obsidian-orbital/issues).

Please include:

- Your **Obsidian version** and **Orbital version** (Settings → Community plugins).
- Your **platform** (desktop OS or mobile).
- **Steps to reproduce** the problem.
- Any relevant **`[Orbital]` console output** captured with Debug logging on.
