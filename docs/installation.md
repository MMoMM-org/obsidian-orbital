# Installation

Orbit installs like any other Obsidian community plugin. The recommended path is
the in-app Community Plugins browser; manual and beta (BRAT) installs are also
covered below.

<p align="center">
  <img src="../assets/orbit-relations-statusbar.png" alt="The Orbit pane showing the Relations tab" width="320">
</p>

## Prerequisites

- **Obsidian 1.5.7 or newer.** This is the minimum app version Orbit supports.
- **Desktop or mobile.** Orbit is not desktop-only — it runs on both.
- **Community plugins enabled.** If your vault is in *Restricted mode*, you'll need
  to turn it off before you can install community plugins (see the steps below).

## Install from Community Plugins

1. Open **Settings → Community plugins**.
2. If *Restricted mode* is on, click **Turn on community plugins**.
3. Click **Browse**, then search for **Orbit**.
4. Click **Install**, then **Enable**.

Orbit's settings appear under **Settings → Community plugins → Orbit** (the gear
icon).

## Install manually

Use this when you want a specific release or can't reach the Community Plugins
browser.

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/MMoMM-org/obsidian-orbit/releases/latest).
2. Create the folder `<vault>/.obsidian/plugins/orbit/`.
3. Copy the three downloaded files into that folder.
4. Restart Obsidian (or reload it), then enable **Orbit** under
   **Settings → Community plugins**.

### Beta builds via BRAT

To track pre-release builds, use the
[BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin:

1. Install and enable BRAT from Community Plugins.
2. In BRAT, choose **Add beta plugin** and enter `MMoMM-org/obsidian-orbit`.

## Verify the installation

After enabling Orbit, confirm it loaded:

- **Orbit** is listed and toggled on under **Settings → Community plugins**.
- Run **Orbit: Open** from the command palette — the Orbit pane opens in the right
  sidebar.
- The pane shows a tab switcher with **Relations**, **Dangling links**, and
  **Recent files**.
- With a note open, the status bar shows the orbit icon with backlink / 2nd-hop
  counts (for example `🪐 3/5`). This item can be toggled in Orbit's settings.

## Updating

- **Community Plugins:** open **Settings → Community plugins**, click
  **Check for updates**, then **Update** next to Orbit.
- **BRAT (beta):** BRAT checks its tracked plugins on startup; you can also run
  **BRAT: Check for updates** from the command palette.
- **Manual install:** re-download `main.js`, `manifest.json`, and `styles.css`
  from the [latest release](https://github.com/MMoMM-org/obsidian-orbit/releases/latest)
  and replace the files in `<vault>/.obsidian/plugins/orbit/`, then reload Obsidian.

## Next steps

- See [Configuration](configuration.md) for every setting Orbit exposes.
- See [Usage](usage.md) for a walkthrough of the Relations, Dangling links, and
  Recent files tabs.
