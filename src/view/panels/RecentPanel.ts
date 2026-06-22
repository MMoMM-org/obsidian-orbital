/**
 * RecentPanel — T4.3
 *
 * Renders the Recent Notes tab: a flat MRU list with click navigation,
 * per-row remove, clear-list, drag-to-link, and mobile insert.
 *
 * Design decisions:
 * - Pure render: `render(container)` always rebuilds the subtree from scratch;
 *   callers re-invoke on store changes (driven by OrbitView in T4.3b).
 * - No innerHTML: all nodes via createEl/createDiv/createSpan (CON-3).
 * - Collision disambiguation: when two visible entries share a basename, a
 *   muted folder path is shown next to each one.
 * - DOM listeners routed through the injected `registerDomEvent` delegate for
 *   lifecycle-safe cleanup (same pattern as RelationsPanel / DanglingPanel).
 * - Keymap.isModEvent imported from the obsidian barrel (tests shadow it).
 * - Missing-file self-heal: on click, if the file is no longer in the vault
 *   a Notice is shown, store.delete() is called, and the panel re-renders.
 * - Mobile insert: when Platform.isMobile is true, each row gets an always-
 *   visible "Insert link at cursor" button (no hover-only actions).
 */

import { Keymap, Notice, Platform, setIcon } from "obsidian";
import type { RecentFileEntry } from "recent/RecentFilesStore";

// ---------------------------------------------------------------------------
// Structural app subset
// ---------------------------------------------------------------------------

export interface RecentPanelApp {
	workspace: {
		getLeaf(newLeaf: boolean | string): {
			openLinkText(path: string, sourcePath: string, newLeaf: boolean | string): void | Promise<void>;
		};
	};
	vault: {
		getAbstractFileByPath(path: string): { path: string } | null;
	};
}

// ---------------------------------------------------------------------------
// Structural store subset
// ---------------------------------------------------------------------------

export interface RecentPanelStore {
	list(): readonly RecentFileEntry[];
	removeOne(path: string): Promise<void>;
	clear(): Promise<void>;
	delete(path: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Structural drag-helper subset
// ---------------------------------------------------------------------------

export interface RecentPanelDragHelper {
	onDragStart(event: DragEvent, path: string): void;
	insertAtCursor(linktext: string): void;
}

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface RecentPanelDeps {
	/** MRU store (or structural subset). */
	store: RecentPanelStore;
	/** Structural Obsidian App subset. */
	app: RecentPanelApp;
	/** Drag / insert helper. */
	dragHelper: RecentPanelDragHelper;
	/** DOM event registration delegate for lifecycle-safe cleanup. */
	registerDomEvent: <K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (ev: HTMLElementEventMap[K]) => void,
	) => void;
}

// ---------------------------------------------------------------------------
// Augmented element helper — same cast pattern as RelationsPanel
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
	createSpan(opts?: { cls?: string; text?: string }): HTMLElement;
	empty(): void;
}

// ---------------------------------------------------------------------------
// RecentPanel
// ---------------------------------------------------------------------------

/**
 * Maximum number of rows rendered before a "Show more" control appears.
 * RecentPanel is normally bounded by recentListLength (default 20), but
 * guard against cases where the store grows unbounded (SDD §451).
 */
const RENDER_CAP = 100;

export class RecentPanel {
	private readonly deps: RecentPanelDeps;
	private container: HTMLElement | null = null;

	constructor(deps: RecentPanelDeps) {
		this.deps = deps;
	}

	/**
	 * (Re)render the panel into `container`.
	 * Always rebuilds from scratch — call whenever the store changes.
	 */
	render(container: HTMLElement): void {
		this.container = container;
		(container as unknown as AugmentedEl).empty();

		const entries = this.deps.store.list();

		this.renderToolbar(container, entries);

		if (entries.length === 0) {
			this.renderEmptyState(container);
			return;
		}

		const collisionSet = this.buildCollisionSet(entries);
		const list = (container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-recent-list",
		});

		this.renderRowsWithCap(list, Array.from(entries), collisionSet);
	}

	private renderRowsWithCap(
		list: HTMLElement,
		entries: RecentFileEntry[],
		collisionSet: Set<string>,
	): void {
		const visible = entries.slice(0, RENDER_CAP);
		for (const entry of visible) {
			this.renderRow(list, entry, collisionSet.has(entry.basename));
		}

		if (entries.length > RENDER_CAP) {
			const overflow = entries.slice(RENDER_CAP);
			const showMoreBtn = (list as unknown as AugmentedEl).createEl("button", {
				cls: "orbit-show-more",
				text: `Show ${overflow.length} more…`,
			});

			this.deps.registerDomEvent(showMoreBtn, "click", () => {
				showMoreBtn.remove();
				for (const entry of overflow) {
					this.renderRow(list, entry, collisionSet.has(entry.basename));
				}
			});
		}
	}

	// -------------------------------------------------------------------------
	// Private — toolbar (Clear list button)
	// -------------------------------------------------------------------------

	private renderToolbar(container: HTMLElement, entries: readonly RecentFileEntry[]): void {
		if (entries.length === 0) return;

		const toolbar = (container as unknown as AugmentedEl).createDiv({
			cls: "orbit-recent-toolbar",
		});

		const clearBtn = (toolbar as unknown as AugmentedEl).createEl("button", {
			cls: "clickable-icon orbit-recent-clear-btn",
			attr: { "aria-label": "Clear list" },
		});

		setIcon(clearBtn, "trash");

		const clearLabel = (clearBtn as unknown as AugmentedEl).createSpan({
			cls: "orbit-recent-clear-label",
			text: "Clear list",
		});
		clearLabel.setAttribute("aria-hidden", "true");

		this.deps.registerDomEvent(clearBtn, "click", () => {
			void this.deps.store.clear().then(() => {
				if (this.container !== null) this.render(this.container);
			});
		});
	}

	// ---------------------------------------------------------------------------
	// Private — row
	// ---------------------------------------------------------------------------

	private renderRow(
		container: HTMLElement,
		entry: RecentFileEntry,
		showPath: boolean,
	): void {
		const row = (container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-recent-row nav-file tree-item-self is-clickable",
			attr: {
				draggable: "true",
				"data-path": entry.path,
			},
		});

		// Label area
		const labelWrap = (row as unknown as AugmentedEl).createDiv({
			cls: "orbit-recent-label",
		});

		(labelWrap as unknown as AugmentedEl).createSpan({
			cls: "orbit-recent-basename",
			text: entry.basename,
		});

		if (showPath) {
			const folder = this.folderOf(entry.path);
			(labelWrap as unknown as AugmentedEl).createSpan({
				cls: "orbit-recent-path",
				text: folder,
			});
		}

		// Action buttons area (always-visible, ≥44px via CSS)
		const actions = (row as unknown as AugmentedEl).createDiv({
			cls: "orbit-recent-actions",
		});

		// Mobile insert button
		if (Platform.isMobile) {
			this.renderInsertBtn(actions, entry);
		}

		// Remove button
		this.renderRemoveBtn(actions, row, entry);

		// Click: open file
		this.deps.registerDomEvent(row, "click", (evt) => {
			// Ignore clicks that originated from the action buttons
			const target = evt.target as HTMLElement;
			if (target.closest(".orbit-recent-actions") !== null) return;

			void this.handleRowClick(entry, evt);
		});

		// Drag
		this.deps.registerDomEvent(row, "dragstart", (evt) => {
			this.deps.dragHelper.onDragStart(evt, entry.path);
		});
	}

	// -------------------------------------------------------------------------
	// Private — action buttons
	// -------------------------------------------------------------------------

	private renderRemoveBtn(
		container: HTMLElement,
		row: HTMLElement,
		entry: RecentFileEntry,
	): void {
		const btn = (container as unknown as AugmentedEl).createEl("button", {
			cls: "clickable-icon orbit-recent-action-btn",
			attr: { "aria-label": "Remove from recent list" },
		});

		setIcon(btn, "x");

		this.deps.registerDomEvent(btn, "click", (evt) => {
			evt.stopPropagation();
			// Capture focus target before the re-render removes the row (Gap B).
			const nextFocus = this.findSiblingRow(row, "next") ?? this.findSiblingRow(row, "prev");
			void this.deps.store.removeOne(entry.path).then(() => {
				if (this.container !== null) {
					const currentContainer = this.container;
					this.render(currentContainer);
					// Focus the sibling row that was next/prev before removal, or the first
					// row in the re-rendered list if the sibling was also removed.
					// Use a manual attribute selector; paths don't contain characters
					// that break attribute matching when wrapped in double quotes.
					const escapedPath = nextFocus !== null
						? nextFocus.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
						: null;
					const target = escapedPath !== null
						? currentContainer.querySelector<HTMLElement>(`[data-path="${escapedPath}"]`)
						: currentContainer.querySelector<HTMLElement>(".orbit-recent-row");
					target?.focus();
				}
			});
		});
	}

	/**
	 * Returns the data-path of the next or previous .orbit-recent-row sibling
	 * relative to `row` within the same list container, or null if none exists.
	 */
	private findSiblingRow(row: HTMLElement, direction: "next" | "prev"): string | null {
		const parent = row.parentElement;
		if (parent === null) return null;
		const rows = Array.from(parent.querySelectorAll(".orbit-recent-row"));
		const idx = rows.indexOf(row);
		if (idx === -1) return null;
		const sibling = direction === "next" ? rows[idx + 1] : rows[idx - 1];
		return sibling?.getAttribute("data-path") ?? null;
	}

	private renderInsertBtn(container: HTMLElement, entry: RecentFileEntry): void {
		const btn = (container as unknown as AugmentedEl).createEl("button", {
			cls: "clickable-icon orbit-recent-action-btn",
			attr: { "aria-label": "Insert link" },
		});

		setIcon(btn, "file-plus");

		this.deps.registerDomEvent(btn, "click", (evt) => {
			evt.stopPropagation();
			this.deps.dragHelper.insertAtCursor(entry.basename);
		});
	}

	// -------------------------------------------------------------------------
	// Private — click handler (open / self-heal)
	// -------------------------------------------------------------------------

	private async handleRowClick(entry: RecentFileEntry, evt: MouseEvent): Promise<void> {
		const exists = this.deps.app.vault.getAbstractFileByPath(entry.path) !== null;

		if (!exists) {
			new Notice("File no longer exists");
			await this.deps.store.delete(entry.path);
			if (this.container !== null) this.render(this.container);
			return;
		}

		const newLeaf = Keymap.isModEvent(evt);
		const leaf = this.deps.app.workspace.getLeaf(newLeaf);
		void leaf.openLinkText(entry.path, "", newLeaf);
	}

	// -------------------------------------------------------------------------
	// Private — empty state
	// -------------------------------------------------------------------------

	private renderEmptyState(container: HTMLElement): void {
		(container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-recent-empty",
			text: "No recent notes yet.",
		});
	}

	// -------------------------------------------------------------------------
	// Private — helpers
	// -------------------------------------------------------------------------

	/** Returns the set of basenames that appear more than once in the list. */
	private buildCollisionSet(entries: readonly RecentFileEntry[]): Set<string> {
		const counts = new Map<string, number>();
		for (const entry of entries) {
			counts.set(entry.basename, (counts.get(entry.basename) ?? 0) + 1);
		}
		const collisions = new Set<string>();
		for (const [basename, count] of counts) {
			if (count > 1) collisions.add(basename);
		}
		return collisions;
	}

	/** Returns the directory portion of a path (everything before the last /). */
	private folderOf(path: string): string {
		const idx = path.lastIndexOf("/");
		return idx === -1 ? "" : path.slice(0, idx);
	}
}
