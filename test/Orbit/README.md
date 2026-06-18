# Test Vault

Minimal Obsidian vault for developing `orbit` against a live Obsidian app.

## Setup

1. Open this directory as a vault in Obsidian (**Open folder as vault** → select `test/Orbit`). The directory name becomes the vault name in Obsidian's sidebar.
2. Trust the author when prompted — this enables community plugins.
3. Run the build from the repo root:
   ```bash
   npm run dev      # watch mode — rebuilds and redeploys on every change
   # or: npm run build   # one-shot
   ```
   esbuild **copies** the build (`main.js`, `styles.css`, a dev-stamped
   `manifest.json`) into `.obsidian/plugins/orbit/` and drops a
   `.hotreload` marker there. There is no symlink step — Electron's plugin
   loader does not follow symlinked plugin files reliably, so real files are
   copied in.
4. Enable the plugin in **Settings → Community plugins** (first time only).
5. Leave `npm run dev` running. Each rebuild redeploys into the vault and Hot
   Reload reloads the plugin live — no manual disable/enable.

## What's in here

- `.obsidian/plugins/hot-reload/` — [pjeby/hot-reload](https://github.com/pjeby/hot-reload) v0.3.0, committed so the vault is usable immediately.
- `.obsidian/plugins/orbit/` — created and populated by the build (gitignored). Hot Reload watches it via the `.hotreload` marker.
- `.obsidian/community-plugins.json` — enables Hot Reload on first open.
- `.gitignore` — keeps workspace state and the plugin's build output out of git.
