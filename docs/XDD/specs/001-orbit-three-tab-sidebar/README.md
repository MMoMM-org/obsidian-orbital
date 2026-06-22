# Specification: 001-orbit-three-tab-sidebar

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-06-18 |
| **Current Phase** | Implemented |
| **Last Updated** | 2026-06-19 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | 6 Must-have features, 34 acceptance criteria |
| solution.md | completed | Modular layered plugin; ADR-1..8 confirmed; EARS acceptance criteria |
| plan/ | completed | 5 phases, 22 tasks, TDD; README manifest + phase-1..5.md |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-18 | Spec scaffolded | Orbit plugin: one right-sidebar ItemView with three tabs (Relations, Dangling Links, Recent Files) absorbing relation-pane, recent-files-obsidian, and dangling-links/broken-links |
| 2026-06-18 | Dangling targets shown in Relations as distinct "Missing" section with "Manage →" link | User decision — bridges Relations and Dangling Links tabs |
| 2026-06-18 | Dangling Links default scope = vault-wide with folder toggle | User decision |
| 2026-06-18 | PRD authored (Standard research mode) | 6 Must features; flagship = vault-wide rename/merge; preview+confirm gating; no telemetry |
| 2026-06-18 | License = MIT | GPL source (recent-files-obsidian, broken-links) must be reimplemented from patterns; MIT source (relation-pane, dangling-links) reusable with attribution |
| 2026-06-18 | PRD finalized | User chose to finalize PRD; later opted to continue to SDD |
| 2026-06-18 | SDD ADR-1 single tabbed ItemView | One pane value-prop; shared index; standard pattern |
| 2026-06-18 | SDD ADR-2 incremental reverse-index graph | O(degree) lookups vs relation-pane O(N·M); 10k–50k vault perf |
| 2026-06-18 | SDD ADR-3 vanilla DOM rendering (no Svelte) | No framework dep; XSS-safe; matches scaffold; reimplementing anyway |
| 2026-06-18 | SDD ADR-4 Dangling grouped by-target (toggle to source) | Rename/merge/create act on target → more actionable; resolves open question |
| 2026-06-18 | SDD ADR-5 hybrid bulk-rewrite (renameFile + offset-splice vault.process) | Native link-update where possible; precise dangling rewrites |
| 2026-06-18 | SDD ADR-6 alias target = existing note only | Per brief; guarantees alias resolves; resolves open question |
| 2026-06-18 | SDD ADR-7 Recent Files parity is v1 launch gate | Users can uninstall recent-files-obsidian at v1; resolves open question |
| 2026-06-18 | SDD ADR-8 persistence split (saveData vs view getState/setState) | Settings global+Sync; tab/scope per-leaf |
| 2026-06-18 | PLAN authored — 5 phases, 22 tasks (TDD) | P1 foundation → P2 graph+Relations → P3 Dangling+rewrite → P4 Recent (∥) → P5 integration+submission; Recent parallel to P2–3 |
| 2026-06-18 | Spec validation PASS; spec marked Ready | Consistency + AC coverage PASS; fixed AC count (34→33); added T1.0 (extend obsidian test mock + vitest aliases) + per-phase mock-extension notes from drift findings |
| 2026-06-19 | Implementation complete | Phase 5 shipped (T5.1–T5.4): cross-tab Manage→ filter, a11y/mobile/perf hardening (focus mgmt, narrow-mode label collapse, ~100-row truncation, bulk yield+progress Notice), submission compliance (manifest description + README + corrected MIT/GPL attribution), 33-AC end-to-end acceptance suite. Found+fixed bug: RecentFilesStore.list() now caps to recentListLength at read time. 537 tests green; lint/typecheck/build clean. All 5 phases complete on branch feat/orbit-tabs. |

## Context

Orbit is an Obsidian plugin consolidating three sidebar tools into one tabbed `ItemView`:
- **Relations** (active-note scoped): outgoing links, backlinks, 2nd-hop related notes, dangling targets.
- **Dangling Links** (vault-wide / folder-scoped): unresolved links grouped by source file, with inline vault-wide actions (rename/merge, change-to-alias, create missing note, delete link) via `vault.process`.
- **Recent Files** (vault-global): recently opened notes, click/cmd-click to open, drag-to-insert wikilink, path/tag exclusions.

### Source plugins researched
| Plugin | Author | License | Reuse |
|--------|--------|---------|-------|
| obsidian-relation-pane | mottox2 | MIT | code lift OK (with attribution) |
| recent-files-obsidian | tgrosinger | GPL-3.0 | patterns only — reimplement |
| obsidian-dangling-links | graydon | MIT | code lift OK |
| obsidian-broken-links | ipshing | GPL-3.0 | patterns only — reimplement |

### Key technical findings
- **Recent Files drag-to-link** uses internal `app.dragManager.dragFile()` + `metadataCache.getFirstLinkpathDest()`; exclusions are regex-based; persists `{path, basename}[]` with MRU dedup.
- **Relations**: mottox2 only does outgoing→co-citation 2nd-hop, no cross-hop dedup, no hover preview, unguarded `Object.keys` crash bug, O(N·M) backlink scan, no debounce. Orbit should add reverse-index + debounce + dedup + `hover-link` trigger.
- **Dangling Links**: neither source plugin has inline mutation actions — net-new. ipshing's file-walk (`getMarkdownFiles` + `getFileCache().links/embeds/frontmatterLinks` + `getFirstLinkpathDest`) beats `unresolvedLinks` (catches broken headings/blocks, gives line/col). Edits via `vault.process`, splice by cached link offsets back-to-front, `fileManager.renameFile` when a real file exists, `generateMarkdownLink` to respect user link format.

---
*This file is managed by the xdd-meta skill.*
