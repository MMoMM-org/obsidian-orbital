/**
 * ConfirmRewriteModal — T3.3
 *
 * CON-7: Gates every destructive vault-wide operation with:
 *   - Preview of occurrence count and affected file count
 *   - Non-reversible warning with backup recommendation
 *   - Explicit confirmation (name input for rename; checkbox for delete)
 *   - Merge notice when the entered name matches an existing note
 *
 * DOM: XSS-safe — createEl/createDiv/empty only. No innerHTML/outerHTML.
 * Sentence-case UI text. aria-labels on interactive elements.
 * No style.display — show/hide via CSS classes (is-hidden).
 */

import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { RewritePreview } from "links/LinkRewriteService";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RewriteKind = "rename" | "merge" | "alias" | "delete";

export interface ConfirmRewriteModalOptions {
	/** Preview counts from LinkRewriteService.previewRename (or equivalent). */
	preview: RewritePreview;
	/** The operation kind — drives which confirmation gate is shown. */
	kind: RewriteKind;
	/**
	 * Called when the user confirms. For rename, receives the entered name.
	 * For delete/merge/alias, receives an empty string.
	 */
	onConfirm: (name: string) => void;
	/**
	 * Optional list of existing note base-names used to surface a merge notice
	 * when the entered rename target already exists. Case-insensitive.
	 */
	existingNoteNames?: string[];
}

// ---------------------------------------------------------------------------
// Augmented element helper (same pattern as RelationsPanel / TabBar)
// ---------------------------------------------------------------------------

interface AugmentedEl {
	createEl(
		tag: string,
		opts?: {
			text?: string;
			cls?: string;
			attr?: Record<string, string>;
		},
	): HTMLElement;
	createDiv(opts?: { cls?: string; text?: string }): HTMLElement;
	empty(): void;
}

// ---------------------------------------------------------------------------
// ConfirmRewriteModal
// ---------------------------------------------------------------------------

export class ConfirmRewriteModal extends Modal {
	private readonly opts: ConfirmRewriteModalOptions;

	constructor(app: App, opts: ConfirmRewriteModalOptions) {
		super(app);
		this.opts = opts;
	}

	onOpen(): void {
		this.renderContent();
	}

	onClose(): void {
		(this.contentEl as unknown as AugmentedEl).empty();
	}

	// -------------------------------------------------------------------------
	// Private — render
	// -------------------------------------------------------------------------

	private renderContent(): void {
		const el = this.contentEl as unknown as AugmentedEl;
		el.empty();

		this.renderTitle(el);
		this.renderPreview(el);
		this.renderWarning(el);

		if (this.opts.kind === "rename") {
			this.renderRenameConfirm(el);
		} else if (this.opts.kind === "delete") {
			this.renderDeleteConfirm(el);
		} else {
			this.renderSimpleConfirm(el);
		}
	}

	private renderTitle(el: AugmentedEl): void {
		const kindLabel: Record<RewriteKind, string> = {
			rename: "Rename dangling link",
			merge: "Merge into existing note",
			alias: "Add alias to links",
			delete: "Delete dangling links",
		};
		el.createEl("h2", { text: kindLabel[this.opts.kind] });
	}

	private renderPreview(el: AugmentedEl): void {
		const { occurrences, files } = this.opts.preview;
		el.createEl("p", {
			cls: "orbit-confirm-preview",
			text: `${occurrences} occurrence${occurrences === 1 ? "" : "s"} across ${files.length} file${files.length === 1 ? "" : "s"} will be modified.`,
		});
	}

	private renderWarning(el: AugmentedEl): void {
		el.createEl("p", {
			cls: "orbit-confirm-warning mod-warning",
			text: "This operation cannot be undone. Back up your vault before proceeding.",
		});
	}

	private renderRenameConfirm(el: AugmentedEl): void {
		el.createEl("label", { text: "New name:", cls: "orbit-confirm-label" });

		const input = el.createEl("input", {
			cls: "orbit-confirm-input",
			attr: {
				type: "text",
				"aria-label": "New note name",
				placeholder: "Enter new name…",
			},
		}) as HTMLInputElement;

		// Merge notice: hidden via is-hidden class until a matching name is typed
		const mergeNotice = el.createEl("p", {
			cls: "orbit-confirm-merge-notice is-hidden",
			attr: { "data-notice": "merge" },
		});

		const confirmBtn = el.createEl("button", {
			text: "Confirm",
			cls: "orbit-confirm-btn mod-cta",
			attr: { "data-action": "confirm", "aria-label": "Confirm operation" },
		}) as HTMLButtonElement;
		confirmBtn.disabled = true;

		input.addEventListener("input", () => {
			const value = input.value.trim();
			this.updateMergeNotice(mergeNotice, value);
			confirmBtn.disabled = value.length === 0;
		});

		confirmBtn.addEventListener("click", () => {
			this.opts.onConfirm(input.value.trim());
			this.close();
		});
	}

	private renderDeleteConfirm(el: AugmentedEl): void {
		el.createEl("p", {
			cls: "orbit-confirm-delete-label",
			text: "Check the box below to confirm deletion:",
		});

		const checkboxRow = el.createDiv({ cls: "orbit-confirm-checkbox-row" });
		const checkboxEl = (checkboxRow as unknown as AugmentedEl).createEl("input", {
			attr: {
				type: "checkbox",
				id: "orbit-confirm-delete-checkbox",
				"aria-label": "Confirm deletion of dangling links",
			},
		}) as HTMLInputElement;

		(checkboxRow as unknown as AugmentedEl).createEl("label", {
			text: "I understand this cannot be undone",
			attr: { for: "orbit-confirm-delete-checkbox" },
		});

		const confirmBtn = el.createEl("button", {
			text: "Confirm",
			cls: "orbit-confirm-btn mod-warning",
			attr: { "data-action": "confirm", "aria-label": "Confirm deletion" },
		}) as HTMLButtonElement;
		confirmBtn.disabled = true;

		checkboxEl.addEventListener("change", () => {
			confirmBtn.disabled = !checkboxEl.checked;
		});

		confirmBtn.addEventListener("click", () => {
			this.opts.onConfirm("");
			this.close();
		});
	}

	private renderSimpleConfirm(el: AugmentedEl): void {
		const confirmBtn = el.createEl("button", {
			text: "Confirm",
			cls: "orbit-confirm-btn mod-cta",
			attr: { "data-action": "confirm", "aria-label": "Confirm operation" },
		}) as HTMLButtonElement;
		confirmBtn.disabled = false;

		confirmBtn.addEventListener("click", () => {
			this.opts.onConfirm("");
			this.close();
		});
	}

	// -------------------------------------------------------------------------
	// Private — helpers
	// -------------------------------------------------------------------------

	private updateMergeNotice(noticeEl: HTMLElement, value: string): void {
		const existingNames = this.opts.existingNoteNames ?? [];
		const isMatch = existingNames.some(
			(name) => name.toLowerCase() === value.toLowerCase(),
		);

		if (isMatch) {
			noticeEl.textContent = `Merge into existing note "${value}" — links will point to this note.`;
			noticeEl.classList.remove("is-hidden");
		} else {
			noticeEl.classList.add("is-hidden");
		}
	}
}
