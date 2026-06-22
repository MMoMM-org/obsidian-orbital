/**
 * NotePickerModal — T3.3 / T3.4
 *
 * FuzzySuggestModal over vault folders (pickFolder) or markdown notes
 * (pickNote), used by:
 *   - createNote: let the user pick the destination folder for a new note.
 *   - handleAlias: let the user pick an existing note as the alias target.
 *
 * Promise-based: callers await pickFolder()/pickNote() which resolve with the
 * chosen item or null if the modal is dismissed.
 *
 * DOM: XSS-safe — Obsidian's FuzzySuggestModal handles all rendering.
 * Sentence-case UI. aria-labels on icon-only buttons.
 */

import { FuzzySuggestModal } from "obsidian";
import type { App, TFile, TFolder } from "obsidian";
import type { LogFn } from "shared/logger";

// ---------------------------------------------------------------------------
// NotePickerModal — folder variant
// ---------------------------------------------------------------------------

export class NotePickerModal extends FuzzySuggestModal<TFolder> {
	private resolve: ((folder: TFolder | null) => void) | null = null;
	private readonly log?: LogFn;

	constructor(app: App, log?: LogFn) {
		super(app);
		this.log = log;
		this.setPlaceholder("Choose destination folder…");
	}

	/** Open the modal and return a Promise that resolves with the chosen folder. */
	pickFolder(): Promise<TFolder | null> {
		return new Promise<TFolder | null>((res) => {
			this.resolve = res;
			this.open();
		});
	}

	getItems(): TFolder[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => "children" in f);
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	/** A selection wins immediately. (Obsidian may fire this AFTER onClose.) */
	onChooseItem(item: TFolder, _evt?: MouseEvent | KeyboardEvent): void {
		this.log?.("folderPicker: onChooseItem", { path: item?.path ?? null });
		if (this.resolve !== null) {
			this.resolve(item);
			this.resolve = null;
		}
	}

	onClose(): void {
		super.onClose();
		// See NoteFilePicker: Obsidian fires onClose BEFORE onChooseItem on a
		// selection, so defer the dismissal (null) by a macrotask — a choice
		// arriving right after the close still wins; otherwise it resolves null.
		window.setTimeout(() => {
			if (this.resolve !== null) {
				this.resolve(null);
				this.resolve = null;
			}
		}, 0);
	}
}

// ---------------------------------------------------------------------------
// NotePickerModal — note variant (ADR-6)
// ---------------------------------------------------------------------------

/**
 * NoteFilePicker — FuzzySuggestModal over vault markdown files.
 *
 * Used by handleAlias (T3.4) to pick an existing note as the alias target,
 * satisfying ADR-6: alias must point to an existing note, not a folder.
 *
 * Promise-based: callers await pickNote() which resolves with the chosen TFile
 * or null if the modal is dismissed.
 */
export class NoteFilePicker extends FuzzySuggestModal<TFile> {
	private resolveNote: ((file: TFile | null) => void) | null = null;
	private readonly log?: LogFn;

	constructor(app: App, log?: LogFn) {
		super(app);
		this.log = log;
		this.setPlaceholder("Choose existing note…");
	}

	/** Open the modal and return a Promise that resolves with the chosen note file. */
	pickNote(): Promise<TFile | null> {
		return new Promise<TFile | null>((res) => {
			this.resolveNote = res;
			this.open();
		});
	}

	getItems(): TFile[] {
		const items = this.app.vault.getMarkdownFiles();
		this.log?.("notePicker: getItems", { count: items.length });
		return items;
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	/** A selection wins immediately. (Obsidian may fire this AFTER onClose.) */
	onChooseItem(item: TFile, _evt?: MouseEvent | KeyboardEvent): void {
		this.log?.("notePicker: onChooseItem", { path: item?.path ?? null });
		if (this.resolveNote !== null) {
			this.resolveNote(item);
			this.resolveNote = null;
		}
	}

	onClose(): void {
		super.onClose();
		this.log?.("notePicker: onClose");
		// CRITICAL: Obsidian fires onClose BEFORE onChooseItem when a suggestion is
		// selected. Defer the dismissal (null) resolution by a macrotask so that a
		// choice arriving immediately after the close still wins. If onChooseItem
		// already resolved, resolveNote is null here and this is a no-op.
		window.setTimeout(() => {
			if (this.resolveNote !== null) {
				this.log?.("notePicker: dismissed (no selection)");
				this.resolveNote(null);
				this.resolveNote = null;
			}
		}, 0);
	}
}
