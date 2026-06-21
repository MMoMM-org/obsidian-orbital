# _Orbit Test Guide

A smoke-test script for the Orbit plugin. The notes in this vault form a small
[[Zettelkasten]]/PKM graph whose links are arranged to exercise every tab and action.
Open the Orbit pane (right sidebar, the git-fork icon) and work through the
sections below.

> Real notes (links resolve) vs. **dangling** targets (no file) are deliberate.
> Don't create the dangling targets unless a step tells you to.

## The graph at a glance

- **[[Hub]]** is the centre: 4 outgoing links, 5 backlinks (incl. this guide),
  several 2nd-hop notes, and 3 missing targets.
- Dangling targets seeded across the vault (and the form they test):
  - `[[Atlas of Concepts]]` — plain, in **3 files** (Hub, [[Zettelkasten]], Linking)
  - `[[Concept Atlas]]` — plain, 1 file (Knowledge Management) — a second spelling to **merge**
  - `[[Inbox]]` — plain, 2 files (Hub, 2026-06-19) — use for **create note**
  - `[[Fleeting Notes]]` — plain (Hub), `#Capture` heading ([[Zettelkasten]]), `#^cap01` block (Slip Box)
  - `![[Map of Content]]` — **embed** (Knowledge Management)
  - `[[Daily Note Template|today's template]]` — **alias** form (2026-06-19)
  - `[[MOC]]` — plain (Orbit Plugin) — use for **change to alias**
  - `[[Roadmap]]` — **frontmatter** link (`up:` in Orbit Plugin)

---

## 1 · Single tabbed pane (Feature 1)

- [ ] Open the Orbit pane → one right-sidebar view with a **Relations / Dangling links / Recent files** tab switcher.
- [ ] Click each tab → only that panel shows; the active tab is visually marked.
- [ ] Reload Obsidian (or close/reopen the pane) → the **last-active tab is restored**.
- [ ] Put focus on the tab bar and use **←/→ + Enter/Space** → tabs move and activate without the mouse.
- [ ] Drag the sidebar narrow → tab **labels collapse to icons** (≥44px touch targets stay).

## 2 · Relations tab (Feature 2) — open [[Hub]] first

- [ ] Sections show with counts: **Outgoing (4)**, **Backlinks (5)** (incl. this guide), **2nd-hop**, **Missing (3)**.
- [ ] **2nd-hop** lists Slip Box, Bidirectional Links, Progressive Summarization, Evergreen Notes — grouped by the connecting note, **deduped**, and **excluding** Hub itself and the 1st-hop Atomic Notes.
- [ ] Click a relation row → opens in the current pane. **Cmd/Ctrl-click** (or middle-click) → opens in a new pane.
- [ ] Hover a row (with core **Page preview** enabled) → preview popover appears.
- [ ] Switch the active note rapidly between Hub / [[Zettelkasten]] / Knowledge Management → Relations updates, **debounced** (no flicker).
- [ ] Open **[[Empty Note]]** → empty sections, not a blank pane. Close all notes → clear **empty state**.
- [ ] In Hub's **Missing** section, click **"Manage →"** on `Atlas of Concepts` → jumps to the **Dangling tab filtered to that target**; **"Show all"** restores the full list.

## 3 · Dangling links tab (Feature 3)

- [ ] Default scope is **vault-wide**; targets listed with occurrence counts. `Atlas of Concepts` shows **3 occurrences in 3 files**.
- [ ] **Scope toggle** → switch to the active note's folder. Open **[[Daily/2026-06-19]]** then set folder scope → only `Inbox` and `Daily Note Template` (the Daily/ folder's danglings) remain.
- [ ] **Rename / merge (preview):** rename `Atlas of Concepts` → preview says "3 occurrences in 3 files"; confirm → all three files rewrite, open editors stay in sync.
- [ ] **Merge into existing spelling:** rename `Concept Atlas` → `Atlas of Concepts` → merges the two spellings.
- [ ] **Merge into a real note:** rename `Inbox` → `[[Zettelkasten]]` → preview flags merging into the existing note `[[Zettelkasten]]`.
- [ ] **Change to alias:** on `MOC`, choose *Change to alias* → pick the real note **Knowledge Management** → occurrence rewrites to `[[Knowledge Management|MOC]]`.
- [ ] **Create missing note:** on `Inbox`, choose *Create note* → pick a folder → the note is created.
- [ ] **Delete link:** on any target, *Delete* → confirmation appears (with a **"this note only"** option and the no-undo warning) before removing the `[[…]]`.
- [ ] **Form preservation:** after a rename of `Fleeting Notes`, check `#Capture` (heading), `#^cap01` (block), the `![[…]]` embed, and the `|today's template` alias are all preserved — only the target changed.
- [ ] **Frontmatter:** `Roadmap` appears as a dangling target (from Orbit Plugin's `up:` field) and rewrites in frontmatter.
- [ ] **Empty state:** clear all danglings in a scope → positive "No dangling links" state.

## 4 · Recent files tab (Feature 4)

- [ ] Open several notes → list is **most-recent-first**, no duplicates, capped at the configured length (default 20).
- [ ] Click → opens in current pane; **Cmd/Ctrl-click** → new pane.
- [ ] **Drag** a row into an open editor (desktop) → inserts a `[[wikilink]]` at the drop point.
- [ ] On mobile (or narrow), use the row's **insert action** → `[[wikilink]]` at the cursor.
- [ ] **Path exclusion:** with `Archive/` in the path exclusions, open **[[Archive/Old Ideas]]** → it does **not** appear in Recent. Clear the pattern → it shows up again.
- [ ] **Tag exclusion:** with `archive` in the tag exclusions, open **[[Sandbox/Tagged Scratch]]** → excluded from Recent. Clear the pattern → it returns.
- [ ] Rename/delete a listed note → list updates; clicking a now-missing entry fails gracefully with a notice.
- [ ] **Remove** one entry, then **Clear** the list → both persist across a reload.

## 4b · Exclusions span every surface (Recent + Relations + Unlinked mentions)

> This vault ships with `Archive/` (path) and `archive` (tag) already excluded.
> Each check below is two-directional: confirm the item is **hidden** while the
> pattern is set, then **clear** the pattern and confirm it **reappears**.

- [ ] **Relations · path:** open **[[Linking]]** → with `Archive/` excluded, `Old Ideas` is **absent** from Backlinks; clear the path pattern → `Old Ideas` returns.
- [ ] **Relations · tag:** still on **[[Linking]]** → with `archive` excluded, `Tagged Scratch` is **absent** from Backlinks; clear the tag pattern → it returns.
- [ ] **Unlinked mentions · path:** open **[[Zettelkasten]]**, expand **Unlinked mentions** → `Old Ideas` is **absent** while `Archive/` is excluded; clear it → `Old Ideas` appears (it mentions "Zettelkasten" in plain text).
- [ ] **Unlinked mentions · tag:** on **[[Zettelkasten]]** → `Tagged Scratch` is **absent** while `archive` is excluded; clear the tag pattern → it appears.
- [ ] **Independence:** clearing only the path pattern still hides the tag-excluded `Tagged Scratch`, and vice-versa — path and tag exclusions are evaluated separately.

## 5 · Replaces three plugins (Feature 5)

- [ ] Relations covers outgoing + backlinks (and adds 2nd-hop + hover).
- [ ] Recent covers list + length + exclusions + drag-to-link.
- [ ] Dangling covers unresolved-link listing (and adds inline bulk actions).

## 6 · Settings (Feature 6)

- [ ] Settings → Orbit exposes: recent list length, exclusions (path + tag/frontmatter), 2nd-hop cap, default Dangling scope, Dangling grouping, refresh debounce, default new-note location, default tab.
- [ ] Change a setting (e.g. recent list length) → it persists and the pane reflects it **without a restart**.
- [ ] (Sync) change a setting on another device → Orbit picks it up via `onExternalSettingsChange`.
