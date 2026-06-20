# Decisions Memory

## Dangling delete scope is source-note based, not active-editor based

`LinkRewriteService.applyDelete(target, scope, restrictToSource?)` scopes by an
explicit source path, not by `workspace.getActiveFile()`. The old
`onlyInActiveNote` flag (and the service's `workspace` dependency) was removed:
the Dangling tab has no relationship to whichever note is open in the editor —
that coupling is Relations' job.

UX: the "Only in note: ‹name›" checkbox in `ConfirmRewriteModal` (delete kind)
renders only when the panel passes `deleteSourceNote` — i.e. in **by-source**
grouping, where the delete was triggered from a specific source row. It is
pre-checked there (scopes the delete to that note; uncheck = scope-wide). In
**by-target** grouping there is no single source, so the checkbox is omitted and
the delete spans every source in scope.

## Alias drops the link subpath (heading/block) — intentional, not a bug

`toAlias` (`src/links/wikilink.ts`) deliberately omits `link.subpath` when
rewriting a dangling link to an existing note, e.g.
`[[Fleeting Notes#Capture]]` → `[[Evergreen Notes|Fleeting Notes]]` (the
`#Capture` is dropped). Locked in by `test/links/wikilink.test.ts` ("uses target
only (not subpath) as display text").

Rationale: the anchor pointed into the *non-existent* original target; carrying
it to a different real note would likely produce a dead anchor. The data is
available (`ParsedLink.subpath` is parsed correctly) and `rewriteTarget` keeps
it — so preserving it in alias is a ~1-line change if we ever revisit. Decided
2026-06-20 to keep dropping it; no GitHub issue filed. Do not re-raise without
new input.

Reinforcing point: the Dangling panel groups by bare target name (Obsidian's
`unresolvedLinks` keys carry no subpath), so the anchor is never shown in the UI
anyway — users see "Fleeting Notes", never "Fleeting Notes#Capture". Dropping it
on alias is consistent with what the panel already presents.
