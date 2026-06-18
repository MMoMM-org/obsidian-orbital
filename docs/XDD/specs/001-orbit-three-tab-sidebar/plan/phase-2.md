---
title: "Phase 2: Link graph index & Relations tab"
status: pending
version: "1.0"
phase: 2
---

# Phase 2: Link graph index & Relations tab

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Interface Specifications — Internal Module Contracts]` (LinkGraphIndex, RelationsResult)
- `[ref: SDD/Implementation Examples — 2nd-hop computation]`
- `[ref: SDD/Runtime View — Primary Flow; Complex Logic — incremental index update]`
- `[ref: SDD/ADR-2; Cross-Cutting — Performance, Error handling]`
- `[ref: PRD/Feature 2 (Relations)]`

**Key Decisions**:
- Incremental reverse-index (ADR-2): O(degree) lookups; build once on first `resolved` after layout ready; update per `changed`/`rename`/`delete`.
- Guard all link-map lookups (fixes relation-pane crash); dedup + cap 2nd-hop; use `active-leaf-change` (debounced) for refresh; delegate hover to `hover-link`.

**Dependencies**: Phase 1 (settings, view shell, ExclusionMatcher).

---

## Tasks

Delivers the reverse-index link graph and a working Relations tab: outgoing, backlinks, deduped/capped 2nd-hop, and a "Missing" section bridging to the Dangling tab.

> **Mock extension (do first):** add to `test/__mocks__/obsidian.ts` — `metadataCache.resolvedLinks`/`unresolvedLinks` maps + `getFirstLinkpathDest`, `workspace.trigger`, `Keymap.isModEvent`, and `debounce`. Part of T2.1/T2.3/T2.4 setup.

- [ ] **T2.1 LinkGraphIndex (reverse index + incremental updates)** `[activity: domain-modeling]` `[ref: SDD/Internal Module Contracts; Complex Logic; ADR-2]`

  1. Prime: Read the index contract and the `updateFile` algorithm in SDD; review `resolvedLinks`/`unresolvedLinks` map shapes.
  2. Test: `buildFull` populates forward + reverse (`dest→sources`) + unresolved indexes from mock `metadataCache`; `backlinksOf`/`outgoingOf` return O(degree) results and `[]` for unknown paths (no throw); `updateFile` removes stale reverse edges then adds new ones (no full rescan); `removeFile` drops all edges; `renameFile` retargets dest keys; `danglingTargets({folder})` aggregates `unresolvedLinks` with counts and scope filter; `danglingFor(target)` returns occurrences.
  3. Implement: `src/graph/LinkGraphIndex.ts`.
  4. Validate: unit tests incl. incremental-update correctness vs a full rebuild (same result); typecheck; lint.
  - Success:
    - [ ] Backlink/outgoing lookups are correct and crash-free for missing notes `[ref: SDD/Error Handling]`
    - [ ] Incremental update equals full rebuild for the same vault state `[ref: SDD/ADR-2]`

- [ ] **T2.2 Relations pure functions (outgoing/backlinks/2nd-hop/missing)** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/Implementation Examples — 2nd-hop; PRD/Feature 2]`

  1. Prime: Read the `secondHop` example (deduped, capped, both-direction, self+1st-hop excluded) and `RelationsResult` shape.
  2. Test: outgoing/backlinks derived from index; 2nd-hop excludes active note + all 1st-hop, deduplicates globally across groups, respects `secondHopCap` and sets `truncated`; `secondHopEnabled=false` yields none; missing = unresolved targets of the active note; active note absent from cache → all-empty result, no throw; exclusions applied to results.
  3. Implement: `src/graph/relations.ts` (pure; takes index + settings + active path).
  4. Validate: unit tests cover hub-note cap, dedup, empty/new-note edge cases; typecheck; lint.
  - Success:
    - [ ] 2nd-hop deduped, capped, excludes self+1st-hop with "showing N of M" signal `[ref: PRD/Feature 2]`
    - [ ] No crash when active note missing from link map `[ref: SDD/Risks — relation-pane bug]`

- [ ] **T2.3 RelationsPanel (render, navigate, hover, Missing→Manage)** `[activity: frontend-ui]` `[ref: SDD/User Interface & UX; PRD/Feature 2]`

  1. Prime: Read UI section (collapsible `tree-item` sections, counts, `is-active`, `hover-link`, click/cmd-click), `collapsedSections` persistence.
  2. Test (mock): renders four collapsible sections with counts; click opens in current leaf, `Keymap.isModEvent` opens new leaf; hover triggers `workspace.trigger('hover-link', …)`; "Missing" section shows a "Manage →" control that requests a tab switch to Dangling filtered to the target; empty state when no active markdown note; collapse state persists via view state; counts honor `showCounts`.
  3. Implement: `src/view/panels/RelationsPanel.ts` consuming `relations.ts` + `LinkGraphIndex`.
  4. Validate: unit tests pass; no `innerHTML`; typecheck; lint.
  - Success:
    - [ ] Sections, counts, click/cmd-click, hover preview all work; empty state shown when no note `[ref: PRD/Feature 2]`
    - [ ] "Manage →" emits a navigate-to-Dangling-filtered request `[ref: PRD/Feature 2; SDD/Runtime View]`

- [ ] **T2.4 Wire refresh events (debounced) in main/view** `[activity: integration]` `[ref: SDD/External Interfaces — inbound; Runtime View — Primary Flow]`

  1. Prime: Review inbound events and debounce strategy (eager cheap index update vs debounced view repaint).
  2. Test: `active-leaf-change` triggers a debounced Relations refresh (`refreshDebounceMs`, trailing); `metadataCache 'resolved'` (first, after `onLayoutReady`) builds the index once; `metadataCache 'changed'` updates the index for that file (not debounced away) and schedules a repaint; `vault 'rename'/'delete'` update index; all registered via `this.register*` and cleaned up; debounce timer cleared on unload.
  3. Implement: event wiring in `main.ts`/`OrbitView` using `debounce` from obsidian; pass index + settings to the active panel.
  4. Validate: unit tests assert debounce coalescing and single initial build; `_runCleanup()` clears everything; typecheck; lint.
  - Success:
    - [ ] Rapid note switches coalesce into one refresh; index builds once at startup `[ref: SDD/Performance; ADR-2]`

- [ ] **T2.5 Phase Validation** `[activity: validate]`

  Run all Phase 2 tests, lint, typecheck, build. Verify Relations tab against PRD Feature 2 ACs (sections/counts, 2nd-hop dedup+cap, click/cmd-click, hover, Missing+Manage, empty + missing-note states). Confirm no full-graph rescans on navigation.
