<p align="center">
  <img src="assets/logo-orbit.png" alt="Orbit" width="200">
</p>

<h1 align="center">Orbit</h1>

<p align="center"><em>See what orbits your notes.</em></p>

Orbit is an Obsidian plugin that brings everything connected to the note you're reading into a single sidebar pane. Instead of running three separate plugins for connections, broken links, and history, Orbit gives you one tabbed pane that answers three questions about the active note: **what does it link to and from, which of its links are broken, and what was I just looking at?**

It works on desktop and mobile, and reads Obsidian's own link graph — there's nothing to index or import.

## What Orbit does

- **Relations** — outgoing links, backlinks, deduplicated 2nd-hop "related" notes, unlinked mentions you can convert to links inline, and the note's missing (unresolved) link targets.
- **Dangling links** — every unresolved `[[link]]` across the vault (or just the current folder), grouped by target or by source, with bulk **rename/merge**, **change to alias**, **create note**, and **delete** — each preview-confirmed and never silent. Apart from **create note**, these only rewrite the link text in your notes (e.g. **delete** turns a dangling `[[link]]` back into plain text) — they never create, move, or remove a target file.
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

Building Orbit, the test vault, and the hot-reload workflow are documented in
[docs/development.md](docs/development.md).

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
