---
title: "Phase 4: Recent Files tab"
status: pending
version: "1.0"
phase: 4
---

# Phase 4: Recent Files tab

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — recent/ (RecentFilesStore, DragInsertHelper)]`
- `[ref: SDD/Implementation Gotchas — internal drag API; obsidian-augment.d.ts]`
- `[ref: SDD/Cross-Cutting — Persistence, Mobile; ADR-7, ADR-8]`
- `[ref: PRD/Feature 4 (Recent Files); Feature 5 (replace recent-files-obsidian)]`

**Key Decisions**:
- Recent Files parity is a v1 launch gate (ADR-7): list + length + exclusions + drag-to-link + mobile insert.
- Recent list persisted via `saveData` as `{path, basename}[]` (ADR-8); MRU dedup + prune.
- Drag-to-insert uses internal `app.dragManager.dragFile` (isolated, feature-detected) with a tap-to-insert mobile fallback.

**Dependencies**: Phase 1 (view shell, settings, ExclusionMatcher). Independent of Phases 2–3.

`[parallel: true]` — this phase may run concurrently with Phases 2–3.

---

## Tasks

Delivers the Recent Files tab at parity with `recent-files-obsidian`, enabling its removal.

> **Mock extension (do first):** add to `test/__mocks__/obsidian.ts` — `Platform.isMobile` and an `app.dragManager` stub (`dragFile`/`onDragStart`); type the latter via `src/shared/obsidian-augment.d.ts`. Part of T4.2 setup.

- [ ] **T4.1 RecentFilesStore (MRU, dedup, prune, persist, sync)** `[activity: domain-modeling]` `[ref: SDD/recent/RecentFilesStore; ADR-8]`

  1. Prime: Read the persistence model (`{path, basename}[]`) and recent-files research (dedup via filter+unshift, prune to length, rename/delete sync).
  2. Test: `file-open` prepends MRU and dedupes existing path; list pruned to `recentListLength`; excluded files (via ExclusionMatcher) never added; `rename` updates path/basename in place; `delete` removes entry; remove-one and clear mutate + persist; list survives reload (saveData); changing `recentListLength` re-prunes.
  3. Implement: `src/recent/RecentFilesStore.ts` (reads settings live, persists via plugin `saveSettings`).
  4. Validate: unit tests; typecheck; lint.
  - Success:
    - [ ] MRU list deduped, capped, exclusion-aware, persistent, rename/delete-synced `[ref: PRD/Feature 4]`

- [ ] **T4.2 DragInsertHelper (drag-to-link + mobile fallback)** `[activity: frontend-ui]` `[ref: SDD/Implementation Gotchas; PRD/Feature 4]`

  1. Prime: Read the drag-manager gotcha and the augmentation requirement; review `Platform.isMobile` fallback.
  2. Test: on `dragstart`, resolves the `TFile` (`metadataCache.getFirstLinkpathDest`) and calls `dragManager.dragFile`/`onDragStart` when available; feature-detects a missing `dragManager` and does not throw; mobile insert action inserts a `[[wikilink]]` at the active editor cursor.
  3. Implement: `src/recent/DragInsertHelper.ts` + `src/shared/obsidian-augment.d.ts` (typing `app.dragManager`).
  4. Validate: unit tests (mock dragManager present/absent); typecheck; lint (no eslint-disable).
  - Success:
    - [ ] Desktop drag inserts a wikilink; mobile tap-insert works; absent drag API degrades gracefully `[ref: PRD/Feature 4]`

- [ ] **T4.3 RecentPanel (list, click/cmd-click, remove, clear)** `[activity: frontend-ui]` `[ref: SDD/User Interface & UX; PRD/Feature 4]`

  1. Prime: Read UI list rendering (reuse `nav-file` classes), click semantics, per-item remove, clear-list action.
  2. Test (mock): renders MRU rows (basename + muted path on collision); click opens current leaf, `Keymap.isModEvent` opens new leaf; per-row remove + clear-list update the store and re-render; rows are draggable (wired to DragInsertHelper) with a mobile insert action; clicking a now-missing file shows a Notice and self-heals; empty state when list empty.
  3. Implement: `src/view/panels/RecentPanel.ts`.
  4. Validate: unit tests; ≥44px touch targets / no hover-only actions; no `innerHTML`; typecheck; lint.
  - Success:
    - [ ] Recent list opens/drags/removes/clears correctly with graceful missing-file handling `[ref: PRD/Feature 4]`
    - [ ] Recent-files-obsidian parity reached (removal unblocked) `[ref: PRD/Feature 5; ADR-7]`

- [ ] **T4.4 Phase Validation** `[activity: validate]`

  Run all Phase 4 tests, lint, typecheck, build. Verify Recent tab against PRD Feature 4 ACs and confirm parity checklist (list/length/exclusions/drag/mobile-insert/remove/clear/persist) for the v1 launch gate.
