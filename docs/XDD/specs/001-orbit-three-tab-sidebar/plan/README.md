---
title: "Orbit — Three-Tab Sidebar: Implementation Plan"
status: draft
version: "1.0"
---

# Implementation Plan

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All `[NEEDS CLARIFICATION: ...]` markers have been addressed
- [x] All specification file paths are correct and exist
- [x] Each phase follows TDD: Prime → Test → Implement → Validate
- [x] Every task has verifiable success criteria
- [x] A developer could follow this plan independently

### QUALITY CHECKS (Should Pass)

- [x] Context priming section is complete
- [x] All implementation phases are defined with linked phase files
- [x] Dependencies between phases are clear (no circular dependencies)
- [x] Parallel work is properly tagged with `[parallel: true]`
- [x] Activity hints provided for specialist selection `[activity: type]`
- [x] Every phase references relevant SDD sections
- [x] Every test references PRD acceptance criteria
- [x] Integration & E2E tests defined in final phase
- [x] Project commands match actual project setup

---

## Specification Compliance Guidelines

### How to Ensure Specification Adherence
1. **Before Each Phase**: Read the phase's Specification References (GATE).
2. **During Implementation**: Reference specific SDD sections in each task.
3. **After Each Task**: Run unit tests + lint + typecheck (the Validate step).
4. **Phase Completion**: Run the phase validation task against PRD acceptance criteria.

### Deviation Protocol
When implementation requires changes from the spec: document the deviation + rationale in the phase file, obtain approval, update the SDD if the deviation improves the design, and record it for traceability.

## Metadata Reference
- `[parallel: true]` — tasks/phases that can run concurrently
- `[ref: document/section]` — links to PRD/SDD
- `[activity: type]` — specialist hint

---

## Context Priming

*GATE: Read all files in this section before starting any implementation.*

**Specification**:
- `docs/XDD/specs/001-orbit-three-tab-sidebar/requirements.md` — Product Requirements (6 features, 34 ACs)
- `docs/XDD/specs/001-orbit-three-tab-sidebar/solution.md` — Solution Design (architecture, ADR-1..8, module contracts)
- `src/CLAUDE.md` — TDD cycle, strict-TS rules, thin-main.ts, `register*` cleanup, no runtime `<style>`
- `test/__mocks__/obsidian.ts` — the obsidian mock tests run against (incl. `_runCleanup()`)
- `tcs-patterns:obsidian-plugin` skill — submission rules, lifecycle, mobile, XSS-safe DOM, `vault.process`

**Key Design Decisions** (from SDD):
- **ADR-1**: Single tabbed `ItemView` (one right-sidebar pane, in-view tab bar).
- **ADR-2**: Incremental reverse-index link graph (`dest→sources`), O(degree) queries.
- **ADR-3**: Vanilla DOM rendering (`createEl`/native classes), no Svelte.
- **ADR-4**: Dangling grouped by-target (toggle to by-source).
- **ADR-5**: Hybrid bulk-rewrite — `fileManager.renameFile` for real targets, offset-splice `vault.process` for danglings; `generateMarkdownLink`/`processFrontMatter`.
- **ADR-6**: Alias target = existing note only (picker → `[[note|originalText]]`).
- **ADR-7**: Recent Files parity is a v1 launch gate.
- **ADR-8**: Persistence split — `saveData` (settings + recents) vs `getState/setState` (tab/scope/collapsed).

**Implementation Context**:
```bash
# Testing
npm test                # vitest run (unit, against obsidian mock)
npm run test:watch      # vitest watch
npm run test:coverage   # v8 coverage

# Quality
npm run lint            # eslint src/ (eslint-plugin-obsidianmd) + stylelint styles.css
npm run typecheck       # tsc --noEmit (strict)

# Build
npm run build           # tsc --noEmit -skipLibCheck && esbuild production
npm run dev             # esbuild watch
```

---

## Implementation Phases

Each phase is a separate file. Tasks follow red-green-refactor: **Prime** (context), **Test** (red), **Implement** (green), **Validate** (refactor + verify).

> **Tracking Principle**: track logical units that produce verifiable outcomes. The TDD cycle is the method, not separate tracked items.

- [x] [Phase 1: Foundation — settings, view shell, tab bar](phase-1.md)
- [x] [Phase 2: Link graph index & Relations tab](phase-2.md)
- [ ] [Phase 3: Dangling Links tab & bulk-rewrite engine](phase-3.md)
- [ ] [Phase 4: Recent Files tab](phase-4.md)
- [ ] [Phase 5: Cross-tab integration, accessibility & submission validation](phase-5.md)

**Dependency graph**:
```
Phase 1 (foundation)
   ├──> Phase 2 (graph + Relations)
   │        └──> Phase 3 (Dangling + bulk rewrite)   [needs LinkGraphIndex from P2]
   └──> Phase 4 (Recent Files)                       [parallel: true — only needs P1]
Phase 2 + Phase 3 + Phase 4 ──> Phase 5 (integration & validation)
```
Phase 4 can run in parallel with Phases 2–3 (it depends only on Phase 1).

---

## Plan Verification

| Criterion | Status |
|-----------|--------|
| A developer can follow this plan without additional clarification | ✅ |
| Every task produces a verifiable deliverable | ✅ |
| All PRD acceptance criteria map to specific tasks | ✅ |
| All SDD components have implementation tasks | ✅ |
| Dependencies are explicit with no circular references | ✅ |
| Parallel opportunities are marked with `[parallel: true]` | ✅ |
| Each task has specification references `[ref: ...]` | ✅ |
| Project commands in Context Priming are accurate | ✅ |
| All phase files exist and are linked as `[Phase N: Title](phase-N.md)` | ✅ |

---

## PLAN Status Report

| Field | Value |
|-------|-------|
| specId | 001-orbit-three-tab-sidebar |
| title | Orbit — Three-Tab Sidebar Implementation Plan |
| status | IN_REVIEW |
| phases | 5 |
| totalTasks | 23 (incl. T1.0 test-infra + 5 phase-validation tasks) |
| parallelTasks | 9 |
| specReferences | all tasks carry `[ref: ...]` |
| clarificationsRemaining | 0 |
| validation | PASS (consistency + AC coverage); mock-API prerequisite folded into plan |
