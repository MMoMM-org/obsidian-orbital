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
