# Tools Memory

## vitest resolves bare module paths via a plugin, not aliases

`vitest.config.ts` mirrors tsconfig's `baseUrl: "src"` with a single Vite plugin
(`orbitalModulePaths`, `enforce: "pre"`, a `resolveId` hook) instead of
`resolve.alias`. It replaced ten near-identical alias entries whose
`customResolver` option is deprecated in vitest 5 and gone in Vite 9 (#39).

- It is **filesystem-driven**: a new `src/` subdirectory needs no config change.
  The old version required pasting an eleventh copy of the same block.
- `enforce: "pre"` is required — the hook must run before Vite's own resolver
  turns a bare specifier into an unresolved-import error.
- Real packages stay on Vite's normal path because the hook returns `null` for
  anything that does not exist under `src/`.
- `test/module-resolution.test.ts` locks all three forms (bare directory, file
  stem, `obsidian` → mock). The directory form has **no other coverage** — every
  real import spells out `types/index` — so do not delete that test as redundant.

**`vitest.config.ts` is not type-checked:** `tsconfig.json` has
`"include": ["src/**/*.ts"]`, so `npm run build` never sees it. Changes there are
only validated by actually running the suite.

**`npm run test:coverage` is broken** — `@vitest/coverage-v8` has never been in
`package.json`, though CLAUDE.md lists the command. Tracked separately.

## Coverage: reading the report

`npm run test:coverage` needs `@vitest/coverage-v8`, whose version must track
vitest's major (both 5.1.1 as of #44) — bump them together.

The text reporter **hides fully-covered files**: 33 files are measured but only
22 printed, because 11 sit at 100%. A directory row can therefore show a higher
percentage than its one printed child (`src/shared` 96% vs `logger.ts` 67%).
Nothing is missing from the totals — don't go hunting for excluded files.
`--coverage.reporter=json-summary` then reading `coverage/coverage-summary.json`
gives the per-file truth.

`.d.ts` files are excluded by config, so 35 `src/**/*.ts` → 33 measured.

Baseline at #44: statements 92.7%, branches 80.7%, functions 90.6%, lines 94%.
Weakest by far is `src/footer/BacklinkFooterManager.ts` (53% stmts, 39% branches);
everything else is ≥84% statements.
