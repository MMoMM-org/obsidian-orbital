---
title: "Orbit — Three-Tab Link & Navigation Sidebar"
status: draft
version: "1.0"
---

# Product Requirements Document

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All required sections are complete
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Problem statement is specific and measurable
- [x] Every feature has testable acceptance criteria (Gherkin format)
- [x] No contradictions between sections

### QUALITY CHECKS (Should Pass)

- [x] Problem is validated by evidence (not assumptions)
- [x] Context → Problem → Solution flow makes sense
- [x] Every persona has at least one user journey
- [x] All MoSCoW categories addressed (Must/Should/Could/Won't)
- [x] Every metric has corresponding tracking events
- [x] No feature redundancy (check for duplicates)
- [x] No technical implementation details included
- [x] A new team member could understand this PRD

---

## Output Schema

### PRD Status Report

See status report appended at the bottom of this document.

---

## Product Overview

### Vision
One sidebar pane that surfaces everything connected to the note you're reading — what it links to, what links back, what it almost links to, and where you've recently been — so the user never installs three separate link plugins again.

### Problem Statement
Obsidian users who think in links currently stitch together several single-purpose community plugins to see and manage their note graph from the sidebar:

- **Relation/connection viewers** (e.g. `obsidian-relation-pane`) show outgoing links and backlinks but stop at the first hop, miss Scrapbox-style 2nd-hop discovery, have no hover preview, and (in the studied implementation) carry a known crash bug and re-scan the entire link graph on every navigation — visibly janky on large vaults.
- **Dangling/broken-link viewers** (e.g. `obsidian-dangling-links`, `broken-links`) only *list* unresolved links. The user must then hand-fix each one note by note. There is no way to rename a mistyped target across the whole vault, merge two spellings of the same concept, convert a target to an alias, or bulk-create/delete — the actual work of cleaning up a graph.
- **Recent-files plugins** (e.g. `recent-files-obsidian`) are a separate install again, with their own settings surface.

Running three plugins means three sidebar icons, three settings tabs, three update cadences, and three independent failure modes. None of them connects the "this note references a note that doesn't exist yet" insight (a job for the dangling tab) back to the relations view where the user actually notices it.

Consequence: graph hygiene is tedious enough that most users never do it — dangling links and duplicate concepts accumulate, and discovery stays shallow at one hop.

### Value Proposition
Orbit consolidates relations, dangling-link management, and recent files into **one tabbed sidebar pane** and adds the capability the source plugins lack: **vault-wide, preview-confirmed bulk operations on dangling links** (rename/merge, change-to-alias, create, delete). It goes a hop further than relation-pane with deduplicated 2nd-hop discovery, performs well on large vaults via an incrementally-maintained reverse index, and lets the user delete three plugins. All write operations keep open editors live and in sync.

## User Personas

### Primary Persona: The Linker (power note-taker)
- **Demographics:** Adult knowledge worker / researcher / student; intermediate-to-advanced Obsidian user; comfortable with wikilinks, aliases, and the community plugin ecosystem; uses Obsidian daily on desktop, sometimes mobile.
- **Goals:** See all connections to the current note at a glance; discover non-obvious related notes (2nd hop); keep the graph clean by fixing/merging mistyped or duplicate link targets quickly; jump back to recently-visited notes; reduce the number of installed plugins.
- **Pain Points:** First-hop-only relation views; manual, one-note-at-a-time dangling-link cleanup; no way to merge `[[Zettelkasten]]` and `[[Zettelkasten Method]]`; plugin sprawl; sidebar performance lag on big vaults.

### Secondary Personas
- **The Gardener (vault maintainer):** Periodically audits the whole vault for broken/duplicate links and missing notes. Primary user of the Dangling Links tab's vault-wide scope and bulk operations; needs confidence (preview + confirmation) before mass edits and a clear warning that bulk edits aren't undoable.
- **The Mobile Reader:** Uses Orbit on a phone/tablet mainly to read relations and tap through to notes. Needs touch-friendly targets, a working tab switcher on narrow screens, and a non-drag way to insert links (drag-to-insert is desktop-only).

## User Journey Maps

### Primary User Journey: Explore and navigate connections
1. **Awareness:** User is reading a note and wants to know what it connects to and what connects back, beyond the inline links.
2. **Consideration:** Today they use the core Backlinks pane plus a relation plugin; they evaluate Orbit because it adds 2nd-hop discovery, hover preview, and folds dangling + recent into the same pane.
3. **Adoption:** User enables Orbit, opens the right-sidebar pane, lands on the Relations tab scoped to the active note.
4. **Usage:** They scan Outgoing / Backlinks / 2nd-hop / Missing sections, hover to preview, click to open (Cmd/Ctrl-click for a new pane), collapse sections they don't need. As they navigate, the pane follows the active note.
5. **Retention:** The pane consistently reflects the current note quickly, surfaces related notes they wouldn't have found, and becomes their default navigation surface — replacing the separate relation and recent-files plugins.

### Secondary User Journeys

**Journey B — Clean up dangling links vault-wide (Gardener):**
1. **Awareness:** User notices (in Relations' "Missing" section, or during a periodic audit) that they've been writing a concept two different ways, or referencing notes that don't exist.
2. **Consideration:** Core Obsidian and existing plugins only list these; fixing means opening each source note manually.
3. **Adoption:** User switches to the Dangling Links tab (vault-wide by default).
4. **Usage:** For a dangling target they pick an inline action — rename/merge, change-to-alias, create the missing note, or delete the link — review a preview ("X occurrences in Y files"), confirm, and Orbit rewrites every occurrence at once while keeping open editors in sync.
5. **Retention:** Cleanup that used to take dozens of manual edits now takes one confirmed operation; the user trusts the preview and returns to maintain graph hygiene regularly.

**Journey C — Jump to a recent note / insert a link (all personas):**
1. **Awareness:** User wants to return to a note they had open earlier, or insert a link to it while writing.
2. **Consideration:** They'd otherwise use the core quick-switcher or a recent-files plugin.
3. **Adoption:** User opens the Recent Files tab.
4. **Usage:** They click to open (Cmd/Ctrl-click for new pane), or — on desktop — drag the entry into the editor to insert a `[[wikilink]]`; on mobile they use a tap action to insert at the cursor. They tune list length and exclusions in settings.
5. **Retention:** Recent navigation lives in the same pane as relations, so they keep Orbit open and remove the standalone recent-files plugin.

## Feature Requirements

### Must Have Features

#### Feature 1: Single tabbed sidebar pane
- **User Story:** As a Linker, I want one right-sidebar pane with three switchable tabs so that I can access relations, dangling links, and recent files without juggling multiple plugins or sidebar icons.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given Orbit is enabled, When the user opens the Orbit pane, Then a single right-sidebar view appears with a tab switcher offering Relations, Dangling Links, and Recent Files.
  - [ ] Given the pane is open, When the user selects a different tab, Then the corresponding panel is shown and the others are hidden, with the active tab visually indicated.
  - [ ] Given the user selected a tab, When they reload Obsidian or reopen the pane, Then the last-active tab is restored.
  - [ ] Given a keyboard user has focus on the tab switcher, When they use arrow keys and Enter/Space, Then they can move between and activate tabs without a mouse.

#### Feature 2: Relations tab (active-note scoped)
- **User Story:** As a Linker, I want to see this note's outgoing links, backlinks, 2nd-hop related notes, and missing targets so that I can understand and explore its place in my graph.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a markdown note is active, When the Relations tab is shown, Then it displays collapsible sections for Outgoing links, Backlinks, 2nd-hop related notes, and Missing (dangling) targets, each with a count.
  - [ ] Given the active note links to notes that themselves connect to other notes, When 2nd-hop is computed, Then related notes are shown grouped by their connecting note, deduplicated, and excluding the active note and notes already shown as 1st-hop.
  - [ ] Given a relation row, When the user clicks it, Then the target note opens in the current pane; When they Cmd/Ctrl-click (or middle-click), Then it opens in a new pane/tab.
  - [ ] Given a relation row, When the user hovers it (with the platform's page-preview behavior enabled), Then a hover preview of the target appears.
  - [ ] Given the active note references targets that do not exist as files, When Relations renders, Then those appear in a distinct "Missing" section with a "Manage →" affordance that switches to the Dangling Links tab filtered to that target.
  - [ ] Given the user switches the active note, When the active note changes, Then the Relations content updates to the new note (debounced so rapid switching does not cause flicker or lag).
  - [ ] Given no markdown note is active, When the Relations tab is shown, Then a clear empty state is displayed instead of a blank pane.

#### Feature 3: Dangling Links tab with vault-wide bulk actions
- **User Story:** As a Gardener, I want to see all unresolved links and fix them across the whole vault in one operation so that I can keep my graph clean without editing notes one by one.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the vault contains unresolved links, When the Dangling Links tab is shown, Then unresolved targets are listed (grouped by source file or by target), with occurrence counts, defaulting to vault-wide scope.
  - [ ] Given the tab is shown, When the user toggles scope, Then the list switches between vault-wide and the active note's folder, and the displayed copy/counts reflect the current scope.
  - [ ] Given a dangling target, When the user chooses **Rename/merge** and enters a new (or existing) target name, Then Orbit shows a preview stating "X occurrences in Y files will be rewritten" and, on confirmation, rewrites all matching links across the vault while keeping open editors in sync.
  - [ ] Given a dangling target, When the user chooses **Change to alias** and picks an existing note, Then all occurrences are rewritten to a `[[target|alias]]` form (target text preserved, mapped to the chosen note) after preview confirmation.
  - [ ] Given a dangling target, When the user chooses **Create missing note**, Then a dialog lets them choose the destination path/folder, and on confirmation the note is created at that location.
  - [ ] Given a dangling target, When the user chooses **Delete link**, Then a confirmation is required (with the option to limit the deletion to the current note only) before the `[[...]]` syntax is removed from the affected occurrences.
  - [ ] Given any wikilink form — `[[t]]`, `[[t|alias]]`, `[[t#heading]]`, `[[t#^block]]`, and `![[t]]` embeds — When a bulk operation runs, Then the alias, heading, block reference, and embed marker are preserved and only the target is changed (or the link removed).
  - [ ] Given a vault-wide operation completes, When some files could not be updated, Then the user is shown a summary of how many files succeeded and failed rather than a silent partial result.
  - [ ] Given the vault has no unresolved links in the current scope, When the tab is shown, Then a positive empty state ("No dangling links …") is displayed.

#### Feature 4: Recent Files tab (vault-global)
- **User Story:** As any user, I want a list of recently opened notes I can click or drag so that I can quickly return to or link to where I've been.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the user has opened notes, When the Recent Files tab is shown, Then it lists recently opened notes most-recent-first, capped at the configured list length (default 20), without duplicate entries.
  - [ ] Given a recent entry, When the user clicks it, Then the note opens in the current pane; When they Cmd/Ctrl-click, Then it opens in a new pane.
  - [ ] Given a recent entry on desktop, When the user drags it into the editor, Then a `[[wikilink]]` to that note is inserted at the drop position.
  - [ ] Given the user is on mobile (where drag-to-insert is unsupported), When they use the entry's insert action, Then a `[[wikilink]]` is inserted at the editor cursor.
  - [ ] Given exclusion patterns are configured (path globs and/or tag/frontmatter rules), When a file matches an exclusion, Then it does not appear in the recent list.
  - [ ] Given a file in the list is renamed or deleted, When the change occurs, Then the list updates accordingly and clicking a now-missing file fails gracefully with a notice.
  - [ ] Given the recent list, When the user removes a single entry or clears the list, Then the list updates and the change persists across reloads.

#### Feature 5: Replace three existing plugins
- **User Story:** As a Linker, I want Orbit to cover everything my relation, dangling-link, and recent-files plugins did so that I can uninstall them.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a user previously relied on a relation-pane plugin, When they use Orbit's Relations tab, Then outgoing-link and backlink viewing is fully covered (and exceeded by 2nd-hop + hover preview).
  - [ ] Given a user previously relied on a recent-files plugin, When they use Orbit's Recent Files tab, Then recent list, configurable length, exclusions, and drag-to-link are all available.
  - [ ] Given a user previously relied on a dangling/broken-links plugin, When they use Orbit's Dangling Links tab, Then unresolved-link listing is covered (and exceeded by inline bulk actions).

#### Feature 6: Settings
- **User Story:** As a user, I want to configure list length, exclusions, scope, and performance caps so that Orbit fits my vault.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the settings tab, When the user opens it, Then they can configure: recent-files list length, exclusion patterns (path and tag/frontmatter), 2nd-hop cap, default Dangling Links scope, Dangling Links grouping, refresh debounce, default new-note location, and default tab.
  - [ ] Given the user changes a setting, When they leave the field/control, Then the change is persisted and reflected in the pane without requiring a full restart.
  - [ ] Given settings are changed on another device via Sync, When the change arrives, Then Orbit picks up the updated settings.

### Should Have Features
- Per-section collapse state persisted across reloads (Relations).
- Live region / notice announcing the result of bulk operations ("Renamed in 8 files").
- Progress feedback (a notice) during long vault-wide operations.
- "Show N of M" truncation with a "show more" affordance for very long lists / hub notes.
- Front Matter Title display integration (show frontmatter title instead of basename) where available.

### Could Have Features
- Markdown-style link format support (`[alias](target.md)`) in addition to wikilinks, respecting the user's link-format preference.
- Operation log of bulk edits (which files changed, old→new) for auditing/manual revert.
- Middle-click and context-menu (file-menu) integration on rows.
- Bookmark-based exclusion for the recent list (omit bookmarked files).
- Sorting options in Dangling Links (alphabetical vs. occurrence count).

### Won't Have (This Phase)
- An interactive graph visualization (the core Graph view and dedicated graph plugins cover this).
- Cross-file transactional undo of bulk operations (Obsidian provides no such primitive; the product mitigates with preview + confirmation + a backup warning).
- Editing/renaming of *resolved* links and note refactoring beyond what Obsidian's native rename already does.
- Syncing the recent-files list across devices as shared state.
- Non-markdown link management (canvas, attachments) beyond what appears as unresolved links.

## Detailed Feature Specifications

### Feature: Dangling Links — vault-wide rename/merge
**Description:** The flagship capability the source plugins lack. The user selects a dangling (unresolved) link target and changes its name across every occurrence in the vault in one confirmed operation. Renaming a target to a name that already exists (as another dangling target or a real note) is the "merge" path — it consolidates interchangeable spellings (e.g. `[[Zettelkasten]]` + `[[Zettelkasten Method]]`) into one.

**User Flow:**
1. User opens the Dangling Links tab (vault-wide scope by default).
2. User clicks the rename (pencil) action next to a dangling target.
3. System prompts for the new/target name.
4. System computes and shows a preview: "X occurrences in Y files will be rewritten," with a per-file breakdown available.
5. User confirms.
6. System rewrites every matching link across the vault, preserving alias/heading/block/embed parts, keeping open editors in sync.
7. System reports completion (and any per-file failures) via a notice; the list refreshes.

**Business Rules:**
- Rule 1: All occurrences vault-wide are affected by default; the operation is preview-gated and requires explicit confirmation.
- Rule 2: Target matching is case-insensitive (matching Obsidian's link resolution).
- Rule 3: When the new name corresponds to a real existing note, the product treats it as a merge and the operation must update links to point at that note in the user's preferred link format.
- Rule 4: The alias, `#heading`, `#^block`, and `!`-embed parts of each link are preserved; only the target segment changes.
- Rule 5: Open editor buffers must stay in sync — the operation must not desync what the user currently sees in an open note.
- Rule 6: Because there is no cross-file undo, the confirmation copy must warn that the operation is not reversible via undo and recommend a backup / version-control commit first.

**Edge Cases:**
- Scenario: New name collides with an existing note → Expected: present it explicitly as a merge ("Merge references into existing note 'X'") rather than silently overwriting.
- Scenario: Occurrence count changed since the panel last rendered (concurrent edit) → Expected: re-resolve counts at confirm time and re-prompt if they differ.
- Scenario: Some files fail to update mid-batch → Expected: continue the batch, then report "Updated N of M files; K failed" rather than aborting silently.
- Scenario: Empty or invalid new name (illegal path characters) → Expected: block confirmation with inline validation.
- Scenario: Very large match set (thousands of occurrences) → Expected: show progress feedback and keep the UI responsive.
**note:**
we should probably add an additional confirm if the user wants to do this for more then X files (x = 20 by default configurable in the settings, 0 = off)

## Success Metrics

### Key Performance Indicators
- **Adoption:** User enables Orbit and opens the pane at least once; target users uninstall at least one of the three replaced plugins after adopting Orbit.
- **Engagement:** Frequency of tab switches and relation/recent clicks per active day; number of dangling-link bulk operations performed per maintenance session.
- **Quality:** Bulk operations complete without corrupting link syntax (zero malformed-link reports); Relations pane refresh stays responsive (no perceptible lag / no UI freeze) on a 50k-note vault; no crash on notes absent from the link map.
- **Business Impact (project health):** Acceptance into the Obsidian community plugin directory (passes submission review); positive plugin reviews citing consolidation and bulk cleanup.

### Tracking Requirements
> Note: Obsidian community plugins should not phone home. "Tracking" here means user-visible feedback and local logs, not telemetry sent off-device.

| Event | Properties | Purpose |
|-------|------------|---------|
| Bulk operation completed | operation type, occurrences, files succeeded/failed | User-facing completion notice; optional local operation log for audit |
| Bulk operation failure | operation type, files failed | Surface partial failures to the user honestly |
| Pane/tab opened | tab name | (Local only) restore last-active tab; no external telemetry |

## Constraints and Assumptions

### Constraints
- **Platform:** Must run within Obsidian as a community plugin on the public API; desktop and mobile.
- **Compliance with directory rules:** Manifest and code must satisfy Obsidian community-plugin submission requirements (since Orbit aims to replace published plugins).
- **No external network/telemetry:** Operates entirely on the local vault; no data leaves the device.
- **No cross-file transactional undo:** Obsidian offers no atomic multi-file transaction; bulk operations are mitigated by preview + confirmation + backup warning, not by rollback.
- **Performance:** Must remain responsive on large vaults (target 10k–50k notes).
- **Licensing:** Orbit ships under **MIT** (decided 2026-06-18). Consequently, code from GPL-3.0 source plugins (recent-files-obsidian, broken-links) **must be reimplemented from patterns, never copied**; MIT-licensed sources (relation-pane, dangling-links) may be reused with attribution.

### Assumptions
- Users understand wikilinks, aliases, and the difference between resolved and unresolved links.
- Gardener-type users will read the preview and heed the backup warning before confirming bulk edits.
- Obsidian's metadata cache is the authoritative source of link/unresolved-link data.
- Drag-and-drop into the editor is reliable on desktop but not on mobile; a non-drag fallback is required.
- The page-preview (hover) behavior is governed by the user's existing Obsidian setting, not reimplemented.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Bulk rewrite corrupts link syntax (alias/heading/block/embed) | High | Medium | Preserve link parts via cached link positions; comprehensive tests over all wikilink forms; preview before commit |
| User performs destructive bulk op and cannot undo | High | Medium | Mandatory preview + confirmation; explicit non-reversible warning; recommend backup; optional operation log |
| Sidebar lag / UI freeze on large vaults | Medium | Medium | Incrementally-maintained reverse index instead of full scans; debounced refresh; configurable 2nd-hop cap; sequential, progress-reported bulk writes |
| Crash when active note is absent from the link map | Medium | Medium (the studied relation plugin has this exact bug) | Guard all link-map lookups; test the empty/new-note case |
| Reliance on undocumented internals (drag manager, etc.) breaks on Obsidian update | Medium | Low–Medium | Isolate internal-API usage; provide non-drag fallbacks; degrade gracefully |
| GPL contamination from copying GPL source | High (legal) | Low | Reimplement GPL-sourced features from patterns; only lift MIT code with attribution |
| Fails community-directory review | Medium | Low | Follow submission conventions from the outset (manifest, mobile-safety, cleanup, XSS-safe DOM) |

## Open Questions
- [x] ~~What license will Orbit ship under?~~ **Resolved 2026-06-18: MIT.** GPL source must be reimplemented from patterns; MIT source reusable with attribution.
- [x] ~~Default grouping for the Dangling Links tab~~ **Resolved 2026-06-18 (SDD ADR-4): by target, with a toggle to by-source.**
- [x] ~~Should "Change to alias" allow an arbitrary string?~~ **Resolved 2026-06-18 (SDD ADR-6): existing note only, via picker → `[[note|originalText]]`.**
- [x] ~~Is recent-files plugin removal a hard launch gate?~~ **Resolved 2026-06-18 (SDD ADR-7): hard gate — full parity at v1.**

---

## Supporting Research

### Competitive Analysis
- **obsidian-relation-pane (mottox2, MIT):** Shows outgoing links, backlinks, and a thin slice of 2nd-hop (outgoing→co-citation only). No cross-hop dedup, no hover preview, an unguarded crash on notes missing from the link map, and full O(N·M) graph scans with no debounce. Orbit supersedes it with full deduped 2nd-hop, hover preview, a reverse index, and debounced refresh.
- **obsidian-dangling-links (graydon, MIT) / broken-links (ipshing, GPL-3.0):** Both are read-only listers. graydon uses the unresolved-link map; ipshing walks files directly and additionally catches broken headings/blocks. Neither offers inline mutation. Orbit's bulk rename/merge/alias/create/delete is net-new.
- **recent-files-obsidian (tgrosinger, GPL-3.0):** Recent list with regex exclusions and drag-to-link via the internal drag manager. Orbit reimplements these patterns (GPL) into the unified pane and adds a mobile insert fallback.
- **Core Obsidian:** Provides Backlinks, Outline, Graph, and quick-switcher, but no 2nd-hop discovery, no dangling-link management, and recent-files only via a community plugin.

### User Research
Derived from the source plugins' existence and adoption: a sustained user need for sidebar relation viewing, recent-file navigation, and dangling-link visibility. The unmet need — repeatedly visible in the gap between "list dangling links" and "fix them" — is vault-wide bulk link management, which no studied plugin provides.

### Market Data
The three categories each have established community plugins with active user bases, confirming demand. Orbit's differentiation is consolidation (one pane, one settings surface) plus the bulk-management capability that is absent from the category leaders.

---

## PRD Status Report

| Field | Value |
|-------|-------|
| specId | 001-orbit-three-tab-sidebar |
| title | Orbit — Three-Tab Link & Navigation Sidebar |
| status | IN_REVIEW |
| clarificationsRemaining | 0 |
| acceptanceCriteria | 33 |
| openQuestions | All resolved (license=MIT; grouping=by-target; alias=existing-note-only; recent=v1 gate) |

### Section Status
| Section | Status | Detail |
|---------|--------|--------|
| Product Overview | COMPLETE | |
| User Personas | COMPLETE | Primary + 2 secondary |
| User Journey Maps | COMPLETE | 1 primary + 2 secondary |
| Feature Requirements | COMPLETE | 6 Must, plus Should/Could/Won't |
| Detailed Feature Spec | COMPLETE | Rename/merge flagship flow |
| Success Metrics | COMPLETE | Local feedback only, no telemetry |
| Constraints & Assumptions | COMPLETE | |
| Risks & Mitigations | COMPLETE | 7 risks |
| Open Questions | COMPLETE | 4 open |
| Supporting Research | COMPLETE | |
