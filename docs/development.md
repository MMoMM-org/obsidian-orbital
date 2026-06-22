# Development

Setup, build, and the test-vault workflow for hacking on Orbit.

## Setup

```bash
git clone https://github.com/MMoMM-org/obsidian-orbit.git
cd obsidian-orbit
git config core.hooksPath .githooks
npm install
npm run dev       # esbuild watch — rebuilds on every save
npm run build     # production build (tsc check + esbuild)
npm test          # vitest unit tests
npm run lint      # eslint (src/) + stylelint (styles.css)
npm run lint:css  # just the CSS browser-compat check
```

`npm run lint` also runs stylelint with `stylelint-no-unsupported-browser-features`
over `styles.css`, reproducing the Obsidian community-plugin bot's CSS browser-compat
check locally. The Chromium floor it validates against is the `browserslist` field in
`package.json` (template default `chrome 114` for `minAppVersion` 1.5.7) — **bump it to
match your own `minAppVersion`'s Chromium** when you raise the floor (Obsidian 1.6.5 /
Electron 30 → `chrome 124`).

## Test vault and hot-reload

The repo ships a ready-to-use test vault at `test/Orbit/`. Open that folder as a vault
in Obsidian once, and enable Orbit under Community plugins.

You do **not** symlink the build output. The esbuild config deploys it for you: on every
`npm run dev` (and `npm run build`) it copies `main.js`, `manifest.json`, and
`styles.css` into `test/Orbit/.obsidian/plugins/orbit/`, stamps a dev version into the
deployed manifest, and writes a `.hotreload` marker. The
[pjeby/hot-reload](https://github.com/pjeby/hot-reload) plugin (preinstalled in the test
vault) watches that marker and live-reloads Orbit on each rebuild — no Obsidian restart,
no manual toggle.

> The deployed `test/Orbit/.obsidian/plugins/orbit/` folder is **build-owned and
> gitignored** — don't edit or symlink those files by hand; the build overwrites them.

Iteration loop: run `npm run dev`, edit source, save — hot-reload picks up the new build.

## First-light gate

Don't wait until feature-complete to exercise the plugin in a real vault. UI and
API-boundary code carry roughly 80% of plugin bugs but ~30% of LOC, and unit tests
against the Obsidian mock cannot catch path conventions, vault-modify-vs-adapter
mistakes, popout-window assumptions, or layout-ready timing. Schedule a real-vault smoke
session at ~50% of total scope and again before any milestone.
