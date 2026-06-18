# Orbit — Agent Guide

## Repo Layout

```
src/
  main.ts              Plugin entry point (extends Obsidian Plugin)
  types/               Shared TypeScript types
  settings/            Settings UI (PluginSettingTab)
test/
  __mocks__/obsidian.ts  Obsidian API mock for unit tests
```

## Commands

```bash
npm run build        # TypeScript check + esbuild
npm test             # vitest
npm run lint         # eslint with obsidianmd rules
```

## Architecture

- Plugin extends `obsidian.Plugin`
- Settings extend `obsidian.PluginSettingTab`
- All Obsidian API usage goes through typed imports from `obsidian`
- Tests use vitest with a mock of the Obsidian API

## Phase-gate checklist (run at end of each implementation phase)

Before merging a feature phase, verify:

- [ ] **Mock audit.** `grep -rn "from 'obsidian'" src/` — every imported symbol has a stub in `test/__mocks__/obsidian.ts`. Untested production code that imports a new Obsidian symbol crashes the next test that touches it.
- [ ] **Mock helper completeness.** Any new option used in `createDiv` / `createEl` / `createSpan` calls in `src/` — does the mock helper forward that option? `obsidianmd/prefer-create-el --fix` will quietly migrate code; if the mock doesn't forward `attr`, a future lint-fix breaks tests.
- [ ] **Mock parity.** Beyond options: does the mock replicate non-obvious behaviour of the real API (e.g. `normalizePath` strips leading slashes; `Vault.adapter` paths are vault-relative)? End the phase with a real-vault smoke run — five minutes catches the class of bug where mock pretends ≠ reality.
- [ ] **Adapter-API audit.** `grep -rn "vault.adapter\." src/` — every hit is a potential editor-cache desync. Justify each one or migrate to `vault.modify` / `vault.modifyBinary`.
- [ ] **Closure-snapshot review.** Any new event handler / interval / view callback that reads from settings? Does it read through `this.plugin.settings.X` (live) or via a captured `settings` object (snapshot)?
- [ ] **Lifecycle hygiene.** Plugin entry point has a double-init guard. Teardown drains registered cleanups LIFO with try/catch around each.
- [ ] **Real-vault smoke.** Build, hot-reload into `test/orbit/`, exercise the happy path of every feature added in this phase. Bugs found here are 5–10x cheaper than bugs found post-merge.
- [ ] **Diagnostic-tool parity.** If this phase touched an external API, can `scripts/<api>-inspect.mjs` reproduce the same call? If not, extend the script.
