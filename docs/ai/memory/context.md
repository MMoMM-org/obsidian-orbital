# Context Memory

## Current Focus
Spec 001-orbit-three-tab-sidebar fully implemented and finalized (Implemented,
2026-06-19). All 5 phases complete on branch `feat/orbit-tabs`, pushed to origin.

## Phase 5 (final) — done
- T5.1: Manage → deep-link now *filters* the Dangling tab to the target (+ "Show all").
- T5.2: a11y/mobile/perf hardening — panel focus on switch, sibling focus after row
  removal, narrow-mode label collapse, ~100-row truncation + "Show more", bulk-loop
  yield + single progress Notice, ≥44px touch targets.
- T5.3: submission compliance — manifest description + README docs + corrected
  prior-art attribution (mottox2; recent-files = GPL-3.0, not MIT).
- T5.4: 43 end-to-end acceptance tests in test/integration/acceptance.test.ts,
  mapping all 33 PRD ACs 1:1.

## Bug fixed during T5.4
`RecentFilesStore.list()` now slices to `recentListLength` at read time (previously
only capped on write), so lowering the setting shrinks the rendered list without a reload.

## State
537 tests pass; lint/typecheck/build clean. Test vault `test/Orbit/` now holds a
smoke-test corpus (18 PKM notes + `_Orbit Test Guide.md`) covering every tab/action.
Next: real-vault smoke session (hover preview, desktop drag, mobile tap-insert, Sync
settings) before community-directory submission, then PR feat/orbit-tabs → main.
