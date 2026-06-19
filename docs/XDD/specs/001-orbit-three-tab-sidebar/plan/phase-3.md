---
title: "Phase 3: Dangling Links tab & bulk-rewrite engine"
status: in_progress
version: "1.0"
phase: 3
---

# Phase 3: Dangling Links tab & bulk-rewrite engine

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Interface Specifications — wikilink.ts, LinkRewriteService contracts]`
- `[ref: SDD/Implementation Examples — offset-splice back-to-front]`
- `[ref: SDD/Runtime View — Secondary Flow (rename/merge); Error Handling]`
- `[ref: SDD/ADR-4, ADR-5, ADR-6; Cross-Cutting — CON-7 (no undo)]`
- `[ref: PRD/Feature 3 (Dangling + bulk ops); Detailed Feature Spec — rename/merge]`

**Key Decisions**:
- Hybrid rewrite (ADR-5): `renameFile` when new target is a real note; offset-splice `vault.process` (descending offsets) for danglings; `generateMarkdownLink` for new links; `processFrontMatter` for frontmatter links; case-insensitive matching; preserve alias/`#heading`/`#^block`/`!`embed.
- By-target default grouping with toggle (ADR-4); alias target = existing note only (ADR-6).
- Every destructive vault-wide op is preview-gated with a non-reversible warning; counts re-resolved at confirm; partial failures reported.

**Dependencies**: Phase 1 (view/settings/modals base), Phase 2 (`LinkGraphIndex.danglingTargets`/`danglingFor`).

---

## Tasks

Delivers the Dangling Links tab and the vault-wide bulk-rewrite engine — the product's flagship capability.

> **Mock extension (do first):** add to `test/__mocks__/obsidian.ts` — `fileManager.renameFile`/`generateMarkdownLink`/`getNewFileParent`, `FuzzySuggestModal` base class, and `vault.process` if not already present. Part of T3.2/T3.3 setup.

- [x] **T3.1 wikilink parse/rewrite utility (pure)** `[activity: domain-modeling]` `[ref: SDD/wikilink.ts; Implementation Examples]`

  1. Prime: Read `ParsedLink` contract and the wikilink grammar in SDD (`[[t]]`, `[[t|alias]]`, `[[t#h]]`, `[[t#^b]]`, `![[t]]`).
  2. Test: `parseLinkAtOffset` splits target/subpath/alias/embed for every form; `rewriteTarget` changes only the target, preserving subpath+alias+embed; `toAlias` produces `[[real|originalText]]`; `removeLink` yields alias text (or empty); matching is case-insensitive; malformed/edge inputs handled without throw.
  3. Implement: `src/links/wikilink.ts` (pure functions only).
  4. Validate: exhaustive unit tests over all link forms + edge cases; typecheck; lint.
  - Success:
    - [x] All wikilink forms round-trip with parts preserved `[ref: PRD/Feature 3 — preserve alias/#/^/!]`

- [x] **T3.2 LinkRewriteService (preview + rename/merge/alias/delete)** `[activity: backend-api]` `[ref: SDD/LinkRewriteService; Runtime View — Secondary Flow; ADR-5]`

  1. Prime: Read service contract, offset-splice example, hybrid engine + no-undo constraint.
  2. Test (mock vault/fileManager): `previewRename` returns `{occurrences, files[]}` from index; `applyRename` to a non-existent target uses `vault.process` offset-splice (descending) and preserves parts; `applyRename` to a real note path routes via `renameFile`/`generateMarkdownLink` (merge); `applyAlias` rewrites to `[[note|orig]]` for chosen existing note; `applyDelete` removes links (with `onlyInActiveNote` honored); frontmatter links rewritten via `processFrontMatter`; per-file failures accumulate into `BulkResult` (batch continues); operations run sequentially; counts re-resolved before applying.
  3. Implement: `src/links/LinkRewriteService.ts` (uses `wikilink.ts` + `LinkGraphIndex`).
  4. Validate: unit tests incl. multi-link-per-file ordering and partial failure; typecheck; lint.
  - Success:
    - [x] Vault-wide rewrites preserve all link forms and keep editors in sync via `vault.process` `[ref: PRD/Feature 3; SDD/ADR-5]`
    - [x] Real-target rename routes through merge path; partial failures reported `[ref: PRD/Detailed Feature Spec]`

- [x] **T3.3 Create-missing-note + modals (confirm preview, note/folder picker)** `[activity: frontend-ui]` `[parallel: true]` `[ref: SDD/modals; PRD/Feature 3]`

  1. Prime: Review `ConfirmRewriteModal` (preview "X occurrences in Y files" + non-reversible warning + backup recommendation) and `NotePickerModal` (FuzzySuggest over notes/folders); `getNewFileParent`/`vault.create`/`normalizePath`.
  2. Test (mock): ConfirmRewriteModal shows occurrence/file counts, blocks confirm on empty/invalid name, surfaces a merge notice when name matches an existing note, requires explicit confirm for delete; NotePickerModal lists candidates and returns selection; `createNote` resolves destination via picker/default folder and calls `vault.create` with a normalized path; collision handled.
  3. Implement: `src/modals/ConfirmRewriteModal.ts`, `src/modals/NotePickerModal.ts`, `src/links/createNote.ts`.
  4. Validate: unit tests; sentence-case UI; aria-labels on icon buttons; typecheck; lint.
  - Success:
    - [x] Preview + confirmation gate every vault-wide op with a no-undo warning `[ref: SDD/CON-7; PRD/Detailed Feature Spec]`
    - [x] Create-missing-note lets the user pick the path `[ref: PRD/Feature 3 — create]`

- [x] **T3.4 DanglingPanel (grouped tree, scope/grouping toggles, inline actions)** `[activity: frontend-ui]` `[ref: SDD/User Interface & UX; ADR-4; PRD/Feature 3]`

  1. Prime: Read UI section (grouped `tree-item` tree, inline `clickable-icon` actions, scope toggle), default by-target/vault.
  2. Test (mock): lists dangling targets grouped by-target (default) with counts; grouping toggle switches to by-source; scope toggle switches vault↔folder and updates copy/counts; each target row exposes rename/alias/create/delete actions wired to the service+modals; receives and applies the "Manage →" filter from Relations (focus/scroll to that target); positive empty state when none in scope; bulk result surfaced via Notice + `aria-live`.
  3. Implement: `src/view/panels/DanglingPanel.ts`.
  4. Validate: unit tests; no `innerHTML`; mobile-reachable actions (no hover-only); typecheck; lint.
  - Success:
    - [x] All four inline actions work end-to-end with preview/confirm; grouping + scope toggles function `[ref: PRD/Feature 3]`
    - [x] "Manage →" deep link from Relations filters to the target `[ref: PRD/Feature 2; SDD/Runtime View]`

- [ ] **T3.5 Phase Validation** `[activity: validate]`

  Run all Phase 3 tests, lint, typecheck, build. Verify Dangling tab against PRD Feature 3 ACs (grouping/scope, four actions, preview "X in Y", part preservation, merge path, partial-failure report, empty state). Confirm `vault.process` (not `adapter.write`) for all writes and that bulk runs sequentially with progress feedback.
