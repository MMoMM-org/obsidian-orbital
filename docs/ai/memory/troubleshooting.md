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
`DanglingPanel.handleAlias`). Toggle **Settings → Orbit → Advanced → Debug logging**
for `[Orbit] …` traces (gated via `src/shared/logger.ts`).
