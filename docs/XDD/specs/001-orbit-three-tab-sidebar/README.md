# Specification: 001-orbit-three-tab-sidebar

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-06-18 |
| **Current Phase** | PRD |
| **Last Updated** | 2026-06-18 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | 6 Must-have features, 34 acceptance criteria — finalized |
| solution.md | pending | SDD deferred by user |
| plan/ | pending | |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-18 | Spec scaffolded | Orbit plugin: one right-sidebar ItemView with three tabs (Relations, Dangling Links, Recent Files) absorbing relation-pane, recent-files-obsidian, and dangling-links/broken-links |
| 2026-06-18 | Dangling targets shown in Relations as distinct "Missing" section with "Manage →" link | User decision — bridges Relations and Dangling Links tabs |
| 2026-06-18 | Dangling Links default scope = vault-wide with folder toggle | User decision |
| 2026-06-18 | PRD authored (Standard research mode) | 6 Must features; flagship = vault-wide rename/merge; preview+confirm gating; no telemetry |
| 2026-06-18 | License = MIT | GPL source (recent-files-obsidian, broken-links) must be reimplemented from patterns; MIT source (relation-pane, dangling-links) reusable with attribution |
| 2026-06-18 | PRD finalized; SDD/PLAN deferred | User chose to finalize PRD only for now |

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
