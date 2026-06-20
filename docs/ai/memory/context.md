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

## Unlinked mentions feature — added 2026-06-20
New "Unlinked mentions" section in the Relations tab (between 2nd hop and Missing),
replicating Obsidian's Backlinks→Unlinked-mentions plus two improvements: inline
linking (per-note + per-occurrence) and a 🔗 badge when the note already links the
active one. New modules `graph/unlinkedMentions.ts` (pure scanner) and
`links/MentionLinkService.ts` (async, memoized). Default-collapsed, lazy-scanned.
Two settings added (unlinkedMentionsEnabled, unlinkedOpenInNewTab). See
domain.md + decisions.md for rules/rationale.

## State
602 tests pass; lint/typecheck/build clean. Test vault `test/Orbit/` holds a
smoke-test corpus (18 PKM notes + `_Orbit Test Guide.md`) covering every tab/action,
including Zettelkasten unlinked-mention fixtures.
Next: real-vault smoke session for unlinked mentions (lazy scan on a large vault,
link-all/link-one writes, already-linked badge) before community-directory
submission, then PR feat/orbit-tabs → main.
