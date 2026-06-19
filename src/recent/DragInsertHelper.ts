/**
 * DragInsertHelper — isolates all internal Obsidian drag-manager API usage.
 *
 * Desktop: on `dragstart`, resolves the file via metadataCache and delegates
 * to `app.dragManager.dragFile` when available (feature-detected — may be
 * absent on mobile or after an API change).
 *
 * Mobile fallback (tap-to-insert): `insertAtCursor` inserts `[[wikilink]]`
 * at the active editor cursor via `workspace.getActiveViewOfType(MarkdownView)`.
 *
 * All Obsidian API access is behind the injected `DragInsertHelperDeps`
 * interface so tests can pass plain mocks without a real Obsidian runtime.
 */

import type { TFile, MarkdownView } from "obsidian";

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

/** Shape of app.dragManager — optional so callers can pass undefined to test degradation. */
export interface DragManagerShape {
	dragFile(event: DragEvent, file: TFile): unknown;
	onDragStart(event: DragEvent, dragData: unknown): void;
}

/**
 * Injected dependencies for DragInsertHelper.
 *
 * Keeping Obsidian API access behind this interface means the helper never
 * imports the real `App` class and is testable with plain structural mocks.
 */
export interface DragInsertHelperDeps {
	/** Resolve a link path to a TFile. Wraps `metadataCache.getFirstLinkpathDest`. */
	getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
	/** Return the active MarkdownView (for cursor insert), or null. */
	getActiveMarkdownView(): MarkdownView | null;
	/** The internal drag manager — optional; absent on mobile or API-changed builds. */
	dragManager?: DragManagerShape;
}

// ---------------------------------------------------------------------------
// DragInsertHelper
// ---------------------------------------------------------------------------

export class DragInsertHelper {
	private readonly deps: DragInsertHelperDeps;

	constructor(deps: DragInsertHelperDeps) {
		this.deps = deps;
	}

	/**
	 * Handle a `dragstart` event on a recent-file row.
	 *
	 * Resolves the path to a TFile and, if `dragManager` is available,
	 * calls `dragFile` to initiate a native Obsidian file drag.
	 * Degrades gracefully when `dragManager` is absent or the file is gone.
	 */
	onDragStart(event: DragEvent, path: string): void {
		const file = this.deps.getFirstLinkpathDest(path, "");
		if (file === null) return;

		const dm = this.deps.dragManager;
		if (dm === undefined) return;

		const dragData = dm.dragFile(event, file);
		dm.onDragStart(event, dragData);
	}

	/**
	 * Insert `[[linktext]]` at the active editor cursor.
	 *
	 * Used as the mobile tap-to-insert fallback. Safe no-op when there is no
	 * active MarkdownView (e.g. no note open, non-markdown leaf active).
	 */
	insertAtCursor(linktext: string): void {
		const view = this.deps.getActiveMarkdownView();
		if (view === null) return;

		view.editor.replaceSelection(`[[${linktext}]]`);
	}
}
