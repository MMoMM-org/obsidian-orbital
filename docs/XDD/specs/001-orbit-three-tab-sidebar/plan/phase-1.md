---
title: "Phase 1: Foundation — settings, view shell, tab bar"
status: in_progress
version: "1.0"
phase: 1
---

# Phase 1: Foundation — settings, view shell, tab bar

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Directory Map]` (view/, shared/, settings/, types/)
- `[ref: SDD/Interface Specifications — Application Data Models]` (OrbitSettings, OrbitViewState, TabId)
- `[ref: SDD/Cross-Cutting Concepts — Persistence, Accessibility, Mobile, Cleanup]`
- `[ref: SDD/ADR-1, ADR-3, ADR-8]`
- `[ref: PRD/Feature 1 (tabbed pane), Feature 6 (settings)]`

**Key Decisions**:
- Single tabbed `ItemView` (ADR-1); vanilla DOM (ADR-3); settings via `saveData`, tab/scope via `getState/setState` (ADR-8).
- `main.ts` stays thin — lifecycle wiring only; all listeners via `this.register*`.

**Dependencies**: none (greenfield foundation).

---

## Tasks

Establishes the plugin skeleton: real settings model, an exclusion utility shared by later tabs, an accessible tab-switching `ItemView` shell, and view/command registration — yielding an openable (empty) Orbit pane with working tabs and a settings tab.

> **Test-infrastructure prerequisite (from spec validation, 2026-06-18):** the current `test/__mocks__/obsidian.ts` lacks several APIs the TDD tests rely on. T1.0 below establishes the foundation-level additions; each later phase extends the mock for its own needs (Phase 2: `metadataCache.resolvedLinks`/`unresolvedLinks`/`getFirstLinkpathDest`, `workspace.trigger`, `Keymap.isModEvent`, `debounce`; Phase 3: `fileManager.renameFile`/`generateMarkdownLink`/`getNewFileParent`, `FuzzySuggestModal`; Phase 4: `Platform.isMobile`, `app.dragManager`). Also add the same path aliases as `tsconfig` to `vitest.config.ts` so new modules import by alias in tests.

- [ ] **T1.0 Extend obsidian test mock + vitest aliases** `[activity: test-infra]` `[ref: SDD/Implementation Context — test/__mocks__/obsidian.ts; validation findings]`

  1. Prime: Read `test/__mocks__/obsidian.ts` and `vitest.config.ts`; list the APIs each phase's tests need (see prerequisite note above).
  2. Test: a smoke test imports `ItemView` from the mock and instantiates a trivial subclass; a module imported via path alias (e.g. `types/index`) resolves in a test.
  3. Implement: add `ItemView` base class (getViewType/getDisplayText/getIcon/getState/setState/onOpen/onClose) to the mock; add path aliases to `vitest.config.ts` matching `tsconfig` `baseUrl: src`. (Per-phase API stubs added in their phases.)
  4. Validate: smoke test passes; existing tests still green; typecheck.
  - Success:
    - [ ] `ItemView` and alias imports work in tests; no regression `[ref: SDD/Implementation Context]`

- [ ] **T1.1 Orbit settings model & defaults** `[activity: domain-modeling]` `[ref: SDD/Application Data Models]`

  1. Prime: Read the `OrbitSettings`/`DEFAULT_SETTINGS`/`TabId`/`DanglingScope`/`DanglingGrouping` definitions in SDD.
  2. Test: defaults match SDD (recentListLength 20, secondHopCap 50, debounce 300, scope "vault", grouping "target", defaultTab "relations"); `loadSettings` merges partial stored data over defaults; unknown keys ignored; `recentFiles` defaults to `[]`.
  3. Implement: replace `src/types/index.ts` placeholder with `OrbitSettings`, `OrbitViewState`, relation/dangling domain types, and `DEFAULT_SETTINGS`. Update `loadSettings`/`saveSettings` in `main.ts` to the new shape (keep `Object.assign({}, DEFAULT_SETTINGS, stored)`).
  4. Validate: unit tests pass; `npm run typecheck`; lint clean.
  - Success:
    - [ ] Settings load/save round-trips with defaults applied `[ref: PRD/Feature 6]`
    - [ ] Type model matches SDD `[ref: SDD/Application Data Models]`

- [ ] **T1.2 ExclusionMatcher utility** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/Building Block View; PRD/Feature 4]`

  1. Prime: Review exclusion requirements (path regex + frontmatter-tag regex) and the relation-pane research note about over-broad `.toString()` tag matching.
  2. Test: path pattern matches via regex against `file.path`; tag pattern matches frontmatter tags (string or array); invalid regex is caught and treated as no-match (no throw); empty patterns exclude nothing; matcher is pure/stateless given the cache lookup.
  3. Implement: `src/shared/ExclusionMatcher.ts` exposing `isExcluded(file, metadataCache): boolean` built from settings pattern arrays.
  4. Validate: unit tests cover valid/invalid regex and tag shapes; typecheck; lint.
  - Success:
    - [ ] Files matching path/tag patterns are excluded; invalid regex never crashes `[ref: PRD/Feature 4 — exclusions]`

- [ ] **T1.3 OrbitView shell + accessible TabBar** `[activity: frontend-ui]` `[ref: SDD/User Interface & UX; ADR-1, ADR-8]`

  1. Prime: Read SDD UI section (tablist roles, `nav-buttons-container`/`is-active` classes), `getState/setState` persistence, mobile icon-collapse.
  2. Test (against obsidian mock): view returns `VIEW_TYPE="orbit"`, display text "Orbit", an icon; `TabBar` renders three `role="tab"` buttons in a `role="tablist"`, one `aria-selected="true"`; clicking/activating a tab swaps the rendered panel and updates `aria-selected`; arrow keys move selection, Enter/Space activate; `getState`/`setState` round-trips `{activeTab, danglingScope, collapsedSections}`; switching tab renders only the active panel (others removed); `onunload`/`onClose` runs registered cleanup (`_runCleanup()`).
  3. Implement: `src/view/OrbitView.ts` (extends `ItemView`, panel routing, getState/setState) and `src/view/TabBar.ts` (vanilla DOM, roving tabindex). Panels are injected as placeholder render fns for now.
  4. Validate: unit tests pass; no `innerHTML`; typecheck; lint.
  - Success:
    - [ ] Pane shows a working three-tab switcher; active tab persists across reload `[ref: PRD/Feature 1]`
    - [ ] Tablist is keyboard-operable and ARIA-correct `[ref: SDD/Accessibility]`

- [ ] **T1.4 View/command registration + settings tab + styles** `[activity: frontend-ui]` `[ref: SDD/Solution Strategy; PRD/Feature 6]`

  1. Prime: Review thin-main rule, `onLayoutReady` auto-open pattern, leaf-reuse (`getLeavesOfType ?? getRightLeaf`), `onExternalSettingsChange`.
  2. Test: `onload` registers the view type and an "Open Orbit" command without throwing (mock); ribbon/command reveals/reuses a single right-leaf (no duplicate leaves); `onunload` does NOT detach leaves; `SettingsTab` renders controls for every `OrbitSettings` field and persists on change; `onExternalSettingsChange` re-reads settings.
  3. Implement: wire `registerView` + `addCommand` + `onLayoutReady` reveal in `main.ts`; rewrite `src/settings/SettingsTab.ts` for real fields (use `Setting`, `setHeading()`, sentence case, `activeDocument`); add base `orbit-*` rules to `styles.css` (prefixed classes, Obsidian CSS vars).
  4. Validate: unit tests pass; `npm run build` succeeds; eslint-obsidianmd clean; stylelint clean.
  - Success:
    - [ ] Opening the command reveals exactly one Orbit pane; settings round-trip and react live `[ref: PRD/Feature 6]`
    - [ ] No leaf detach on unload; Sync settings change picked up `[ref: SDD/Persistence]`

- [ ] **T1.5 Phase Validation** `[activity: validate]`

  Run all Phase 1 tests, `npm run lint`, `npm run typecheck`, `npm run build`. Verify the pane opens with a keyboard-accessible tab switcher and a working settings tab. Confirm cleanup via mock `_runCleanup()`. No `innerHTML`, no `console.log`.
