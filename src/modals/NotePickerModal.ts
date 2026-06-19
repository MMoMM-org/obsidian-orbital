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

// ---------------------------------------------------------------------------
// NotePickerModal — folder variant
// ---------------------------------------------------------------------------

export class NotePickerModal extends FuzzySuggestModal<TFolder> {
	private resolve: ((folder: TFolder | null) => void) | null = null;

	constructor(app: App) {
		super(app);
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

	onChooseItem(item: TFolder, _evt?: MouseEvent | KeyboardEvent): void {
		if (this.resolve !== null) {
			this.resolve(item);
			this.resolve = null;
		}
	}

	onClose(): void {
		super.onClose();
		if (this.resolve !== null) {
			this.resolve(null);
			this.resolve = null;
		}
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
	private chosen: TFile | null = null;

	constructor(app: App) {
		super(app);
		this.setPlaceholder("Choose existing note…");
	}

	/** Open the modal and return a Promise that resolves with the chosen note file. */
	pickNote(): Promise<TFile | null> {
		return new Promise<TFile | null>((res) => {
			this.resolveNote = res;
			this.chosen = null;
			this.open();
		});
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	/**
	 * Record the choice (first wins) but DON'T resolve here — resolution happens
	 * in onClose, after the modal has fully closed. This lets the caller open a
	 * follow-up modal (e.g. the confirm dialog in handleAlias) without it being
	 * clobbered by this picker's teardown (modal-stacking fix).
	 */
	onChooseItem(item: TFile, _evt?: MouseEvent | KeyboardEvent): void {
		if (this.chosen === null) this.chosen = item;
	}

	onClose(): void {
		super.onClose();
		if (this.resolveNote !== null) {
			const resolve = this.resolveNote;
			const chosen = this.chosen;
			this.resolveNote = null;
			this.chosen = null;
			resolve(chosen);
		}
	}
}
