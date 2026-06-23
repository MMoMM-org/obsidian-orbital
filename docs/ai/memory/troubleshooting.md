# Troubleshooting Memory

## FuzzySuggestModal fires `onClose` BEFORE `onChooseItem` on selection

**Symptom (2026-06-20):** Dangling-tab "alias to existing note" did nothing — after
picking a note, no confirm dialog appeared. Debug trace showed the picker resolving
with `null` even though a note was selected.

**Root cause:** Obsidian's `FuzzySuggestModal` (and `SuggestModal`) calls `onClose`
**before** `onChooseItem` when the user selects an item. Any promise-wrapper that
resolves the choice in `onChooseItem` and resolves `null` in `onClose` therefore
loses every selection: `onClose` resolves `null` first, then `onChooseItem` is a
no-op. (Resolving in `onClose` with a stored choice also fails — at `onClose` time
the choice hasn't arrived yet.)

**Fix (order-independent):** resolve the choice immediately in `onChooseItem`, and
**defer the dismissal (`null`) resolution in `onClose` by a macrotask**
(`window.setTimeout(…, 0)`). A choice arriving right after the close wins; if none
arrives, it resolves `null` as before. See `src/modals/NotePickerModal.ts`
(`NoteFilePicker.pickNote` and `NotePickerModal.pickFolder`). Regression tests in
`test/modals/NotePickerModal.test.ts` simulate the onClose→onChooseItem order.

**Related:** chaining a second modal right after a picker closes can also be
swallowed — open the follow-up modal on a deferred macrotask too (see
`DanglingPanel.handleAlias`). Toggle **Settings → Orbital → Advanced → Debug logging**
for `[Orbital] …` traces (gated via `src/shared/logger.ts`).

## `leaf.openLinkText(..., truthy)` throws "Cannot create property 'state' on …"

`WorkspaceLeaf.openLinkText(linktext, sourcePath, openViewState?)` — its **3rd
arg is openViewState (an object), NOT newLeaf**. When the leaf is already chosen
via `getLeaf(newLeaf)`, call `leaf.openLinkText(path, sourcePath)` with NO 3rd
argument. Passing a truthy value there (boolean `true` OR a PaneType string like
`"tab"`) makes Obsidian run `openViewState.state = …` and throw ("Cannot create
property 'state' on boolean 'true'" / "on string 'tab'"). A falsy 3rd arg
(`false`) is silently ignored — that's why normal (non-mod) clicks never tripped
it and only the "Open in new tab" path did. Fixed in
`RelationsPanel.openMentionPath` and `renderResolvedItem`, and (2026-06-23) in
`DanglingPanel` source-occurrence rows + by-source group labels, which had been
passing `newLeaf` as the 3rd arg (latent crash on Cmd/Ctrl-click — masked in
tests because the mock `openLinkText` is a plain spy that never throws).

## Dangling list doesn't refresh after alias/rename/delete

**Symptom (2026-06-23):** After "alias to existing note" reported all files
succeeded, the dangling target (and a subset of its sources) stayed in the
Dangling list — looked like "some notes weren't aliased."

**Root cause:** bulk rewrites only edit file *content*; they are not a vault
create/delete/rename, so they never set `_structuralChange`. The metadata cache's
`resolvedLinks`/`unresolvedLinks` are **stale at `changed`/vault-event time**
(documented design — see `main._wireMetadataCacheEvents`), so the per-file
`changed → updateFile` re-reads stale resolution and re-adds the now-resolved
target. The later `resolved` event would rebuild correctly, but its handler
returns early when `_structuralChange` is false. Net: no rebuild, stale list.

**Fix:** `DanglingPanel.surfaceResult` calls a new optional dep
`requestRebuild()`; `main._buildDanglingDeps` wires it to set
`_structuralChange = true`, so the next `resolved` rebuilds the index and
repaints — the same path file create/delete/rename already use. (`createNote`
already triggers a real vault `create`, so it was unaffected.)

## Dangling search box steals focus from the editor while typing

**Symptom (2026-06-23):** Once any text was entered in the Dangling search box,
focus kept jumping from the editor into that search box while typing a note (and
on Cmd+F). 

**Root cause:** `DanglingPanel.renderSearchBox` called `input.focus()` on **every**
render whenever the query was non-empty, to keep focus during search typing. But
the panel re-renders on *passive* events too (metadata `changed`, `file-open`,
active-leaf-change) — each of those rebuilt the search box and re-grabbed focus,
even though the user was typing in the editor.

**Fix:** focus restoration moved up to `OrbitalView.renderPanel`, which owns the
teardown (`panelContainer.empty()`). It captures whether `document.activeElement`
was the search input **before** the rebuild and only re-focuses (and restores the
caret) when it genuinely had focus. Passive repaints therefore never pull focus.
The unconditional `query !== ""` focus block in `renderSearchBox` was removed.
Note: `renderPanel` empties the container before the panel's own `render` runs, so
the focus check MUST live in `renderPanel` (pre-empty) — a panel can't observe its
own pre-teardown focus.
