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

## A note-end "footer" in live preview sits a huge gap below the text

**Symptom (2026-07-06):** The backlinks auto-footer, injected as a child of
`.cm-sizer` after `.cm-content`, appeared ~half a screen below the last line in
live preview; reading view showed nothing at all.

**Root cause:** Obsidian gives `.cm-content` a dynamic `padding-bottom` of about
half the viewport (scroll-past-end, so the last line can scroll to centre) —
measured live at `361px`. Anything appended to `.cm-sizer` lands *below* that
padding, so it can never hug the text. Reading view separately rebuilds/pads the
preview, wiping naive sizer injection. **Manual DOM injection into the editor
sizers is the wrong mechanism for note-end content.**

**Fix:** render the footer the two mode-native ways instead (see
`src/footer/BacklinkFooterManager.ts`): reading view via
`registerMarkdownPostProcessor` (append after the note's last block, found with
`ctx.getSectionInfo`); live preview/source via `registerEditorExtension` with a
CodeMirror **block widget at `state.doc.length`** — inside the content flow,
above the scroll-past padding, so it hugs the last line. Use `editorInfoField`
for the file behind an editor.

## CodeMirror: "Block decorations may not be specified via plugins"

**Symptom (2026-07-06):** `RangeError: Block decorations may not be specified via
plugins` thrown from CM on scroll, once the footer block widget was added.

**Root cause:** CodeMirror computes block-decoration heights *before* view
plugins run, so **block decorations (`Decoration.widget({ block: true })`) must
be provided by a `StateField`, never a `ViewPlugin`**. The first cut supplied
them via `ViewPlugin.fromClass(..., { decorations })`, which is only valid for
inline decorations.

**Fix:** define the decoration set in a `StateField<DecorationSet>` with
`provide: (f) => EditorView.decorations.from(f)`; rebuild in `update()` on
`tr.docChanged`, a file change (`editorInfoField`), or a custom refresh
`StateEffect`. See `createFooterEditorExtension` in
`src/footer/BacklinkFooterManager.ts`.

## Dangling search box steals focus from the editor while typing

**Fix:** focus restoration moved up to `OrbitalView.renderPanel`, which owns the
teardown (`panelContainer.empty()`). It captures whether `document.activeElement`
was the search input **before** the rebuild and only re-focuses (and restores the
caret) when it genuinely had focus. Passive repaints therefore never pull focus.
The unconditional `query !== ""` focus block in `renderSearchBox` was removed.
Note: `renderPanel` empties the container before the panel's own `render` runs, so
the focus check MUST live in `renderPanel` (pre-empty) — a panel can't observe its
own pre-teardown focus.

## Dependabot PR fails CI with `npm ci` EUSAGE: lock file out of sync

**Symptom (2026-11-22, PR #33):** a grouped dependabot PR fails `build (24.x)`
with `npm error code EUSAGE` — "`npm ci` can only install packages when your
package.json and package-lock.json are in sync", listing entries like
`Invalid: lock file's eslint@10.14.0 does not satisfy eslint@10.15.0`. The
matrix's other Node version shows up as `CANCELLED` (fail-fast), so only one
real failure is hiding behind two red checks.

**Root cause:** the dependabot branch's lockfile was resolved against an older
registry/base state than its own `package.json` ranges. Rebasing does not help
once a grouped PR has drifted this far.

**Fix:** do not try to repair the dependabot branch. Open one local bump branch,
edit the ranges in `package.json`, run `npm install` to regenerate the lockfile
from scratch, then verify with `npm ci` (must exit 0), `npm run build`,
`npm test`, `npm run lint`. Dependabot auto-closes its superseded PRs once the
versions land on `main`. Precedent: PR #25 (`chore/dep-triage`), PR #36
(`chore/dep-triage-nov`).

**Note:** `npm run lint` is `eslint src/ && stylelint styles.css` with no
`--max-warnings`, so new plugin warnings never fail CI — read them, don't
panic-fix them inside a dep bump.

## `instanceof HTMLElement` is always false in Obsidian popout windows

**Symptom (2026-11-22, issue #37):** the search-box focus restoration above
worked in the sidebar but silently did nothing when the view was in a popout
window — focus and caret were lost on every passive repaint.

**Root cause:** a popout is a **separate realm** with its own `HTMLElement`,
`Node`, … constructors. `active instanceof HTMLElement` compares against the
*main* window's constructor, so it is false for any element belonging to the
popout. Reading `activeElement` off `panelContainer.ownerDocument` (which the
code already did) is not enough — the realm problem is in the narrowing, not the
document lookup.

**Fix:** use Obsidian's `Node.instanceOf()`, a cross-window-safe drop-in. Put
the null check *before* it so TS still narrows through the `this is T`
predicate. `eslint-plugin-obsidianmd` ≥0.6.0 catches this as
`obsidianmd/prefer-instanceof` — but only as a warning.

**Testing realms in jsdom — two traps:**
1. `document.implementation.createHTMLDocument()` does **not** create a new
   realm (same constructors), so it cannot reproduce this. Use an **iframe**:
   `iframe.contentWindow` is a genuine second realm.
2. After a foreign-realm node is adopted into the main document (any
   `appendChild`/`replaceWith` does this), `ownerDocument.defaultView` reports
   the **main** window again, while the prototype chain stays foreign. So a
   realm check must walk the node's own prototype chain — never trust
   `ownerDocument` for it. This is why `installObsidianInstanceOf(win)` in
   `test/__mocks__/obsidian.ts` compares constructor *names* up the chain, and
   why it takes a target window (real Obsidian augments every popout it opens).

Always verify such a test by reverting the fix — a realm test that accidentally
stays in one realm passes either way.

## A green Release run does not mean releasing works

Learned 2026-11-22 (#47). semantic-release **exits 0 when there is nothing to
release**, so a Release workflow run on a `chore`/`docs`/`ci`/`refactor`-only
`main` is green without ever reaching `generateNotes`, the git push, or the
GitHub release. Between 1.3.0 (2026-07-06) and 2026-11-22 every run was green
and nothing was ever published — a broken preset sat there for four months.

**Never read a green Release run as proof the release path works.** Check that a
tag and release actually exist (`gh release list`, `git tag`), or that the log
says `Created tag` / `Published release`.

### The failure it hid

`conventional-changelog-conventionalcommits` **10.x** requires
`conventional-changelog-writer@9`, but `semantic-release@25.0.9` ships writer
8.4.0 and `@semantic-release/release-notes-generator@14.1.1` declares `^8.0.0`.
Preset 8.x/9.x have no `@conventional-changelog/template` dependency and render
fine on writer 8 — so the repo is pinned to `^9.3.1`, with a dependabot `ignore`
for majors.

The error reads oddly: `Missing helper: "<a whole English sentence>"`. That is
deliberate — `@conventional-changelog/template` sets `mainTemplate` to a
handlebars segment literal whose *helper name* is the explanation, so an old
writer surfaces it via handlebars' `helperMissing`. Don't go looking for a
missing helper; read the sentence.

### Verifying a release-notes change without cutting a release

Call the plugin directly instead of running semantic-release (which needs a
token and a clean CI context):

```js
import { generateNotes } from "@semantic-release/release-notes-generator";
await generateNotes({ preset: "conventionalcommits" }, { cwd, commits, lastRelease, nextRelease, options, logger, env: {} });
```

Feed it one `fix`, one `feat!` with a `BREAKING CHANGE` body, and one `chore`,
then assert the first two render and the `chore` does not. The script must live
**inside the repo** — run from elsewhere, Node cannot resolve the packages.
