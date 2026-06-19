---
title: "Phase 5: Cross-tab integration, accessibility & submission validation"
status: in_progress
version: "1.0"
phase: 5
---

# Phase 5: Cross-tab integration, accessibility & submission validation

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Runtime View — Manage→ deep link; Cross-Cutting — Accessibility, Mobile, Persistence]`
- `[ref: SDD/Quality Requirements; Acceptance Criteria (EARS)]`
- `[ref: SDD/CON-3 (submission rules); Risks & Implementation Gotchas]`
- `[ref: PRD/all features; Success Metrics; Constraints]`

**Key Decisions**:
- All 33 PRD acceptance criteria must be demonstrably met.
- Must pass Obsidian community-directory review (manifest, XSS-safe DOM, cleanup, mobile, sentence-case, no `console.log`, no `eslint-disable`).

**Dependencies**: Phases 2, 3, and 4 complete.

---

## Tasks

Integrates the tabs into one coherent pane, hardens accessibility/mobile/performance, and validates the whole plugin against the spec and submission rules.

- [x] **T5.1 Cross-tab integration (Relations "Manage →" → Dangling filtered)** `[activity: integration]` `[ref: SDD/Runtime View; PRD/Feature 2]`

  1. Prime: Review the navigate-to-Dangling-filtered request emitted by RelationsPanel and consumed by DanglingPanel.
  2. Test (mock): clicking "Manage →" on a Missing item switches the active tab to Dangling, applies the target filter, and focuses/scrolls to that target; back-navigation/clear-filter restores the full list; the request survives a single render cycle.
  3. Implement: wire the inter-panel request through `OrbitView` (shared callback/state, no global).
  4. Validate: unit/integration tests; typecheck; lint.
  - Success:
    - [x] Missing→Manage deep link lands on the right target in the Dangling tab `[ref: PRD/Feature 2; SDD/Open-question resolution]`

- [ ] **T5.2 Accessibility, mobile & performance hardening** `[activity: frontend-ui]` `[ref: SDD/Accessibility, Mobile, Performance, Quality Requirements]`

  1. Prime: Review ARIA/keyboard requirements, mobile touch/label-collapse, debounce + 2nd-hop cap + sequential bulk-yield.
  2. Test: focus moves to active panel on tab switch and to next sibling after a row is removed; `aria-live` announces bulk results; tab labels collapse to icons on narrow width; long lists render first ~100 with "show more"; large bulk op yields periodically and shows a progress Notice; refresh stays debounced under rapid navigation.
  3. Implement: focus management, `aria-live` region, responsive CSS in `styles.css`, list truncation + progress feedback, periodic yield in bulk loop.
  4. Validate: unit tests for focus/aria/truncation; manual large-vault sanity if available; typecheck; lint; stylelint.
  - Success:
    - [ ] Keyboard/SR-operable; mobile-usable; no UI freeze on large vault or large bulk op `[ref: SDD/Quality Requirements; PRD/Success Metrics]`

- [ ] **T5.3 Submission compliance & manifest** `[activity: integration]` `[ref: SDD/CON-3; tcs-patterns:obsidian-plugin]`

  1. Prime: Review community-directory manifest rules and code conventions.
  2. Test/checks: `manifest.json` description ≤250 chars, terminal punctuation, no "Obsidian", action-verb lead; `id` unchanged ("orbit"); author has no email; `isDesktopOnly:false` justified (no unguarded Node APIs); grep confirms no `innerHTML`/`console.log`/`eslint-disable`/sample-plugin residue; README documents the three tabs + that it replaces the three plugins (MIT attribution for relation-pane/dangling-links).
  3. Implement: update `manifest.json` description, `README.md`, attribution notes.
  4. Validate: `npm run lint` (eslint-obsidianmd) + `npm run build` clean; manual manifest checklist.
  - Success:
    - [ ] Passes the obsidian-plugin submission checklist `[ref: SDD/CON-3]`

- [ ] **T5.4 End-to-end acceptance validation** `[activity: validate]` `[ref: PRD/all ACs; SDD/Acceptance Criteria]`

  1. Prime: Re-read the PRD acceptance criteria and SDD EARS criteria.
  2. Test: an integration test suite (against the obsidian mock) exercising each tab's primary flow end-to-end — open pane → Relations sections/navigation/hover/Missing→Manage → Dangling rename(merge)/alias/create/delete with preview/partial-failure → Recent open/drag/remove/clear; persistence across simulated reload; settings reactivity + `onExternalSettingsChange`.
  3. Implement: `test/` integration specs mapping 1:1 to the 34 PRD ACs (traceability comments `// AC: Feature N`).
  4. Validate: full `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` green; every PRD AC has a passing test.
  - Success:
    - [ ] All 33 PRD acceptance criteria covered by passing tests `[ref: PRD/Feature 1–6]`
    - [ ] Build + lint + typecheck clean for release `[ref: SDD/Quality Requirements]`
