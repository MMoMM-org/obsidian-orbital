# Orbit

Orbit consolidates three sidebar workflows into one pane: explore note relations (outgoing links, backlinks, 2nd-hop related notes, and missing links), fix dangling links in bulk (rename, merge, change to alias, create, or delete), and browse recent files with drag-to-link and tap-to-insert support.

## Installation

### Community Plugins (after listing)
1. Open Obsidian Settings → Community Plugins
2. Search for "Orbit"
3. Install and enable

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/MMoMM-org/obsidian-orbit/releases/latest)
2. Create folder `<vault>/.obsidian/plugins/orbit/`
3. Copy the downloaded files into that folder
4. Restart Obsidian and enable the plugin

### BRAT (Beta)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add beta plugin: `MMoMM-org/obsidian-orbit`

## Usage

Open the Orbit sidebar pane (click the ribbon icon or use the command palette). The pane has three tabs:

### Relations tab

Shows the relations of the active note:

- **Outgoing links** — all links the current note makes to other notes.
- **Backlinks** — notes that link back to the current note.
- **Related** — deduplicated 2nd-hop notes (notes linked by your links or backlinks), filtered so only notes you haven't directly linked appear.
- **Unlinked mentions** — other notes that mention the current note's name (or one of its aliases) in plain text without linking it. Collapsed by default; it scans note contents on demand when you expand it. Each note shows the number of mentions, a 🔗 badge when it *already* links the current note, and context snippets. Convert mentions to links inline — **Link** on a note links every mention in it, **Link** on a single snippet links just that one. Clicking a note or snippet opens it (in a new tab with Mod-click, or always when the setting below is on).
- **Missing** — unresolved link targets in the current note. A "Manage →" deep-link opens the Dangling tab pre-filtered to the same targets.

### Dangling tab

Vault-wide (or folder-scoped) list of unresolved link targets. Each target shows a preview of the notes that reference it. Bulk operations available per target:

- **Rename** — rewrite every referencing link to a new, confirmed target (merge-safe: if the target already exists, all references collapse onto it).
- **Change to alias** — replace the link with an alias on an existing note.
- **Create note** — create a new note for the target and resolve all references.
- **Delete** — remove all references to the target across the vault.

Operations are preview-confirmed before writing.

### Recent tab

Most-recent-first list of opened notes. Configurable list length and folder exclusions (set in Settings → Orbit). Drag a row to another editor to insert a link, or tap/click to open the note.

### Status bar

A status-bar item shows the orbit icon with **backlinks / 2nd-hop** counts for the active note (e.g. `🪐 3/5`). Hover for an explanation; click it to open the Relations tab. Toggle it under Settings → Orbit → Display (on by default).

## Prior art and attribution

Orbit consolidates what previously required three separate plugins. It draws inspiration from the following prior art:

- [obsidian-relation-pane](https://github.com/mottox2/obsidian-relation-pane) by mottox2 — relation/connection viewer (MIT)
- [obsidian-dangling-links](https://github.com/graydon/obsidian-dangling-links) by graydon — dangling/broken-link viewer (MIT)
- [recent-files-obsidian](https://github.com/tgrosinger/recent-files-obsidian) by tgrosinger — recent files list (GPL-3.0)

The MIT-licensed projects (obsidian-relation-pane, obsidian-dangling-links) informed the implementation; credit and thanks to their authors. recent-files-obsidian is GPL-3.0 licensed — its functionality was reimplemented from scratch using it as a pattern reference only; no GPL code was copied into this MIT-licensed plugin.

## Development

```bash
git clone https://github.com/MMoMM-org/obsidian-orbit.git
cd obsidian-orbit
git config core.hooksPath .githooks
npm install
npm run dev       # Watch mode
npm run build     # Production build
npm test          # Run tests
npm run lint      # Lint src/ (eslint) + styles.css (stylelint)
npm run lint:css  # Just the CSS browser-compat check
```

`npm run lint` also runs stylelint with `stylelint-no-unsupported-browser-features`
over `styles.css`, reproducing the Obsidian community-plugin bot's CSS
browser-compat check locally. The Chromium floor it validates against is the
`browserslist` field in `package.json` (template default `chrome 114` for
`minAppVersion` 1.5.7) — **bump it to match your own `minAppVersion`'s Chromium**
when you raise the floor (Obsidian 1.6.5 / Electron 30 → `chrome 124`).

### Hot-reload vault for development

Plugin development is dramatically faster (~30x per iteration) when the build output is symlinked into a dedicated test vault that can be reload-cycled via `Settings → Community Plugins → toggle off, then on`, rather than restarting Obsidian.

**One-time setup:**

1. Create the test vault directory structure inside the repo:

   ```
   test/orbit/
   ├── .obsidian/
   │   └── plugins/
   │       └── orbit/   # this is what you symlink to
   └── (test notes go here)
   ```

   Add `test/orbit/.obsidian/workspace*` to `.gitignore` (per-developer state).

2. Symlink build outputs into the plugin folder:

   ```bash
   cd test/orbit/.obsidian/plugins/orbit/
   ln -s ../../../../../main.js main.js
   ln -s ../../../../../manifest.json manifest.json
   ln -s ../../../../../styles.css styles.css 2>/dev/null || true
   ```

3. Open the test vault in Obsidian, enable the plugin under Community Plugins.

**Iteration loop:**

```bash
npm run dev    # esbuild watch — rebuilds main.js on every save
```

When you change source: switch to Obsidian → Settings → Community Plugins → toggle the plugin off, then on. The new build is loaded.

**First-light gate.** Don't wait until feature-complete to exercise the plugin in a real vault. UI and API-boundary code carry roughly 80% of plugin bugs but ~30% of LOC, and unit tests against the Obsidian mock cannot catch path conventions, vault-modify-vs-adapter mistakes, popout-window assumptions, or layout-ready timing. Schedule a real-vault smoke session at ~50% of total scope and again before any milestone.

### Diagnostics for external APIs

If this plugin integrates with an external HTTP API or daemon, copy `scripts/api-inspect.template.mjs` to `scripts/<service>-inspect.mjs` and adapt the `BASE_URL` / auth scheme. Use it from day 1 — when an integration bug appears, the SDK's error message rarely tells you whether the bug is auth, path, content-type, or schema. Raw HTTP status + headers + body usually localises in seconds. Observed usage in MiYo: Dropbox path-prefix bugs (archivist), Docker daemon attach hangs (Hashi).

<!-- doc-product:documentation:start -->
## Documentation

- [Installation](docs/installation.md)
- [Configuration](docs/configuration.md)
- [Usage](docs/usage.md) — TODO: Show a new user how to accomplish their first real task with Orbit, then the workflows they will repeat.
- [Troubleshooting](docs/troubleshooting.md) — TODO: Help a user recover from the most common failures, written from their symptom rather than the plugin's internals.
- [Commands Reference](docs/commands-reference.md) — TODO: List every command Orbit contributes to the command palette, with a one-line description and any preconditions.
- [Settings Reference](docs/settings-reference.md) — TODO: Provide a deeper, hand-authored reference for every setting — allowed values, interactions, and when to change each one.
<!-- doc-product:documentation:end -->

## License

MIT - see [LICENSE](LICENSE)
