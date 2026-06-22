/**
 * RenameTargetPicker — combined fuzzy picker for the rename/merge flow.
 *
 * Lists existing notes (merge a dangling link into a real note) and other dangling
 * targets (merge two spellings of the same concept), excluding the current target.
 * Returned to ConfirmRewriteModal's "Choose existing…" affordance to prefill the
 * rename field; the field stays editable so free-text rename still works.
 *
 * Resolution uses the order-independent pattern (see docs/ai/memory/troubleshooting.md):
 * Obsidian fires onClose BEFORE onChooseItem on a selection, so a choice resolves
 * immediately in onChooseItem and the dismissal (null) is deferred in onClose.
 */

import { FuzzySuggestModal } from "obsidian";
import type { App } from "obsidian";
import type { LogFn } from "shared/logger";

export interface RenameChoice {
	value: string;
	kind: "note" | "dangling";
}

/** Structural subset of LinkGraphIndex used here. */
interface IndexLike {
	danglingTargets(scope: { folder?: string }): { target: string }[];
}

export class RenameTargetPicker extends FuzzySuggestModal<RenameChoice> {
	private resolveChoice: ((value: string | null) => void) | null = null;
	private readonly index: IndexLike;
	private readonly currentTarget: string;
	private readonly log?: LogFn;

	constructor(app: App, index: IndexLike, currentTarget: string, log?: LogFn) {
		super(app);
		this.index = index;
		this.currentTarget = currentTarget;
		this.log = log;
		this.setPlaceholder("Choose an existing note or dangling link…");
	}

	/** Open the picker; resolves with the chosen name, or null if dismissed. */
	pick(): Promise<string | null> {
		return new Promise<string | null>((res) => {
			this.resolveChoice = res;
			this.open();
		});
	}

	getItems(): RenameChoice[] {
		const seen = new Set<string>();
		const items: RenameChoice[] = [];

		// Existing notes first; a name that is both a note and a dangling target
		// appears once, as a note.
		for (const file of this.app.vault.getMarkdownFiles()) {
			const value = file.basename;
			if (value === this.currentTarget || seen.has(value)) continue;
			seen.add(value);
			items.push({ value, kind: "note" });
		}

		// Other dangling targets.
		for (const dt of this.index.danglingTargets({})) {
			const value = dt.target;
			if (value === this.currentTarget || seen.has(value)) continue;
			seen.add(value);
			items.push({ value, kind: "dangling" });
		}

		this.log?.("renameTargetPicker: getItems", { count: items.length });
		return items;
	}

	getItemText(item: RenameChoice): string {
		const kindHint = item.kind === "note" ? "note" : "dangling link";
		return `${item.value} — ${kindHint}`;
	}

	onChooseItem(item: RenameChoice, _evt?: MouseEvent | KeyboardEvent): void {
		this.log?.("renameTargetPicker: onChooseItem", item);
		if (this.resolveChoice !== null) {
			this.resolveChoice(item.value);
			this.resolveChoice = null;
		}
	}

	onClose(): void {
		super.onClose();
		window.setTimeout(() => {
			if (this.resolveChoice !== null) {
				this.resolveChoice(null);
				this.resolveChoice = null;
			}
		}, 0);
	}
}
