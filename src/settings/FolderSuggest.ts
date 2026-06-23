import { AbstractInputSuggest, TFolder } from "obsidian";
import type { App } from "obsidian";

/**
 * FolderSuggest — inline autocomplete for vault folder paths, attached to a
 * settings text input. Mirrors Obsidian core's "default location for new
 * notes" picker: the user can type a path or pick an existing folder from the
 * dropdown. The selected path is written back to the input and the input's
 * `input` event is fired so the host Setting's `onChange` persists it.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private readonly textInputEl: HTMLInputElement;

	constructor(app: App, textInputEl: HTMLInputElement) {
		super(app, textInputEl);
		this.textInputEl = textInputEl;
	}

	protected getSuggestions(query: string): TFolder[] {
		const lowerQuery = query.toLowerCase();
		const folders: TFolder[] = [];
		for (const file of this.app.vault.getAllLoadedFiles()) {
			if (file instanceof TFolder && file.path.toLowerCase().includes(lowerQuery)) {
				folders.push(file);
			}
		}
		return folders;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		// Root folder has an empty path; show "/" so it is selectable.
		el.setText(folder.path === "" ? "/" : folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.textInputEl.value = folder.path;
		// Fire the native input event so the Setting's onChange handler persists.
		this.textInputEl.dispatchEvent(new Event("input"));
		this.close();
	}
}
