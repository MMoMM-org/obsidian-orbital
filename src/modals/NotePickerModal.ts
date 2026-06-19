/**
 * NotePickerModal — T3.3
 *
 * FuzzySuggestModal over vault folders, used by createNote to let the user
 * pick the destination folder for a new note.
 *
 * Promise-based: callers await pickFolder() which resolves with the chosen
 * TFolder or null if the modal is dismissed.
 *
 * DOM: XSS-safe — Obsidian's FuzzySuggestModal handles all rendering.
 * Sentence-case UI. aria-labels on icon-only buttons.
 */

import { FuzzySuggestModal } from "obsidian";
import type { App, TFolder } from "obsidian";

// ---------------------------------------------------------------------------
// NotePickerModal
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
