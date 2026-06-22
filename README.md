<p align="center">
  <img src="assets/logo-orbit.png" alt="Orbit" width="200">
</p>

<h1 align="center">Orbit</h1>

<p align="center"><em>See what orbits your notes.</em></p>

Orbit is an Obsidian plugin that brings everything connected to the note you're reading into a single sidebar pane. Instead of running three separate plugins for connections, broken links, and history, Orbit gives you one tabbed pane that answers three questions about the active note: **what does it link to and from, which of its links are broken, and what was I just looking at?**

It works on desktop and mobile, and reads Obsidian's own link graph — there's nothing to index or import.

## What Orbit does

- **Relations** — outgoing links, backlinks, deduplicated 2nd-hop "related" notes, unlinked mentions you can convert to links inline, and the note's missing (unresolved) link targets.
- **Dangling links** — every unresolved `[[link]]` across the vault (or just the current folder), grouped by target or by source, with bulk **rename/merge**, **change to alias**, **create note**, and **delete** — each preview-confirmed and never silent.
- **Recent files** — a most-recent-first list of opened notes; drag a row into an editor to insert a `[[wikilink]]`, or click to open.
- **Status bar** — an item showing backlink / 2nd-hop counts for the active note; click it to jump to the Relations tab.

See the [**Usage guide**](docs/usage.md) for screenshots and the full walkthrough.

## Installation

Install **Orbit** from Obsidian's **Settings → Community plugins → Browse**, then enable it. For manual and beta (BRAT) installs, see the [installation guide](docs/installation.md).

## Migrating from another plugin

Orbit reads Obsidian's own link graph, so there's nothing to import — your notes and links already work. To switch over:

1. Disable the community plugins Orbit replaces: **obsidian-relation-pane**, **obsidian-dangling-links**, and **recent-files-obsidian**.
2. Optionally turn off Obsidian's core **Backlinks** and **Outgoing links** panes if you now use Orbit's Relations tab instead.

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
- [Usage](docs/usage.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Commands Reference](docs/commands-reference.md)
- [Settings Reference](docs/settings-reference.md)
<!-- doc-product:documentation:end -->

## License

MIT - see [LICENSE](LICENSE)
