/**
 * DanglingPanel — T3.4
 *
 * Renders the Dangling tab: a grouped tree of unresolved wikilink targets
 * with inline actions (rename, alias, create, delete).
 *
 * Design decisions:
 * - Pure render: `render(container)` always rebuilds from scratch; callers
 *   re-invoke on vault changes or toggle events (driven by OrbitView).
 * - Default grouping: by-target (ADR-4). Toggle switches to by-source.
 * - Default scope: vault. Toggle switches to folder (uses getFolderPath()).
 * - No innerHTML: all nodes via createEl/createDiv/createSpan (CON-3).
 * - Actions use mobile-reachable clickable-icon buttons (not hover-only).
 * - DOM listeners routed through injected registerDomEvent for lifecycle safety.
 * - Bulk results surfaced via Notice + aria-live="polite" region.
 * - "Manage →" deep-link: reads activeDanglingFilter (set by OrbitView.setState),
 *   scrolls to and highlights the matching group row.
 */

import { Keymap, Notice, setIcon } from "obsidian";
import type { LinkGraphIndex } from "graph/LinkGraphIndex";
import type {
	OrbitSettings,
	DanglingTarget,
	DanglingGrouping,
	DanglingScope,
} from "types/index";
import type { RewritePreview, BulkResult, RewriteScope } from "links/LinkRewriteService";
import type { RewriteKind } from "modals/ConfirmRewriteModal";
import type { TFile, TFolder } from "obsidian";
import type { LogFn } from "shared/logger";

// ---------------------------------------------------------------------------
// Structural types — injected so tests can swap with mocks
// ---------------------------------------------------------------------------

export interface DanglingPanelApp {
	vault: {
		getAbstractFileByPath(path: string): { path: string } | null;
		create(path: string, data: string): Promise<{ path: string }>;
		getAllLoadedFiles(): Array<{ path: string; children?: unknown[] }>;
	};
	fileManager: {
		getNewFileParent(sourcePath: string): { path: string };
	};
	workspace: {
		getLeaf(newLeaf: boolean | string): {
			openLinkText(path: string, sourcePath: string, newLeaf: boolean | string): void | Promise<void>;
		};
	};
}

interface ServiceLike {
	previewRename(target: string, scope: RewriteScope): Promise<RewritePreview>;
	applyRename(target: string, newName: string, scope: RewriteScope): Promise<BulkResult>;
	applyAlias(target: string, realNotePath: string, scope: RewriteScope): Promise<BulkResult>;
	applyDelete(target: string, scope: RewriteScope, onlyInActiveNote: boolean): Promise<BulkResult>;
}

interface ConfirmRewriteModalConstructor {
	new (
		app: DanglingPanelApp,
		opts: {
			preview: RewritePreview;
			kind: RewriteKind;
			onConfirm: (name: string) => void;
		},
	): { open(): void; onlyInThisNote?: boolean };
}

interface FolderPickerConstructor {
	new (app: DanglingPanelApp): { pickFolder(): Promise<TFolder | null> };
}

interface NotePickerConstructor {
	new (app: DanglingPanelApp): { pickNote(): Promise<TFile | null> };
}

type CreateNoteFn = (
	target: string,
	app: DanglingPanelApp,
	settings: OrbitSettings,
	pickerFolder: TFolder | null,
) => Promise<{ file: { path: string }; existed: boolean }>;

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface DanglingPanelDeps {
	/** Pre-built link graph index. */
	index: LinkGraphIndex;
	/** Returns current plugin settings (called on each render). */
	getSettings: () => OrbitSettings;
	/** Structural Obsidian App subset. */
	app: DanglingPanelApp;
	/** Returns the current grouping mode. */
	getGrouping: () => DanglingGrouping;
	/** Persists a new grouping value. */
	setGrouping: (g: DanglingGrouping) => void;
	/** Returns the current scope mode. */
	getScope: () => DanglingScope;
	/** Persists a new scope value. */
	setScope: (s: DanglingScope) => void;
	/** Returns the current active folder path (for folder scope). */
	getFolderPath: () => string;
	/**
	 * Returns the persistent active dangling filter target, or null (show all).
	 * Set by setActiveFilter when the "Manage →" deep-link arrives; persists
	 * across re-renders until clearActiveFilter is called (e.g. user clicks "Show all").
	 */
	getActiveFilter: () => string | null;
	/** Persists the active filter target in OrbitView state. */
	setActiveFilter: (target: string) => void;
	/** Clears the active filter and restores the full list. */
	clearActiveFilter: () => void;
	/** LinkRewriteService instance (or compatible mock). */
	service: ServiceLike;
	/** ConfirmRewriteModal constructor. */
	ConfirmRewriteModal: ConfirmRewriteModalConstructor;
	/** Folder picker modal constructor (NotePickerModal). */
	folderPicker: FolderPickerConstructor;
	/** Note picker modal constructor (NoteFilePicker). */
	notePicker: NotePickerConstructor;
	/** createNote function. */
	createNote: CreateNoteFn;
	/** Optional debug logger (gated by the debugLogging setting). */
	log?: LogFn;
	/**
	 * DOM event registration delegate — routed through the owning Component
	 * so listeners are tracked and torn down on unload.
	 */
	registerDomEvent: <K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (ev: HTMLElementEventMap[K]) => void,
	) => void;
}

// ---------------------------------------------------------------------------
// Augmented element helper — same cast pattern as RelationsPanel / TabBar
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
	classList: { toggle(cls: string, force?: boolean): void; add(...cls: string[]): void; contains(cls: string): boolean };
}

// ---------------------------------------------------------------------------
// DanglingPanel
// ---------------------------------------------------------------------------

/**
 * Maximum number of target/source groups rendered before a "Show more" control appears.
 * Keeps the panel responsive on large vaults (SDD §451).
 */
const RENDER_CAP = 100;

export class DanglingPanel {
	private readonly deps: DanglingPanelDeps;

	constructor(deps: DanglingPanelDeps) {
		this.deps = deps;
	}

	/**
	 * (Re)render the panel into `container`.
	 * Always rebuilds from scratch — call whenever data changes or toggles fire.
	 */
	render(container: HTMLElement): void {
		(container as unknown as AugmentedEl).empty();

		const settings = this.deps.getSettings();
		const scope = this.buildScope();
		const allTargets = this.deps.index.danglingTargets(scope);
		const grouping = this.deps.getGrouping();

		// Read the persistent active filter (set via OrbitView.setState by the
		// "Manage →" deep-link in RelationsPanel, or by a previous render cycle).
		const activeFilter = this.deps.getActiveFilter();

		// Toolbar: grouping + scope toggles, plus "Show all" when filter active
		this.renderToolbar(container, activeFilter);

		// Aria-live region for bulk operation results
		const liveRegion = this.renderLiveRegion(container);

		if (allTargets.length === 0) {
			this.renderEmptyState(container);
			return;
		}

		// Apply active filter: show only the matching target group when set
		const targets = activeFilter !== null
			? allTargets.filter((dt) => dt.target === activeFilter)
			: allTargets;

		if (grouping === "target") {
			this.renderByTarget(container, targets, scope, settings, liveRegion, activeFilter);
		} else {
			this.renderBySource(container, targets, scope, settings, liveRegion);
		}
	}

	// -------------------------------------------------------------------------
	// Private — toolbar
	// -------------------------------------------------------------------------

	private renderToolbar(container: HTMLElement, activeFilter: string | null): void {
		const toolbar = (container as unknown as AugmentedEl).createDiv({
			cls: "orbit-dangling-toolbar",
		});

		const grouping = this.deps.getGrouping();
		const scope = this.deps.getScope();

		// Grouping toggle
		const groupingLabel = grouping === "target" ? "Group by source" : "Group by target";
		const groupingBtn = (toolbar as unknown as AugmentedEl).createEl("button", {
			text: groupingLabel,
			cls: "orbit-dangling-toggle-btn",
			attr: {
				"data-action": "toggle-grouping",
				"aria-label": groupingLabel,
			},
		});

		this.deps.registerDomEvent(groupingBtn, "click", () => {
			this.deps.setGrouping(grouping === "target" ? "source" : "target");
		});

		// Scope toggle
		const scopeLabel = scope === "vault" ? "Vault" : "Folder";
		const scopeBtn = (toolbar as unknown as AugmentedEl).createEl("button", {
			text: scopeLabel,
			cls: "orbit-dangling-toggle-btn",
			attr: {
				"data-action": "toggle-scope",
				"aria-label": scope === "vault" ? "Switch to folder scope" : "Switch to vault scope",
			},
		});

		this.deps.registerDomEvent(scopeBtn, "click", () => {
			this.deps.setScope(scope === "vault" ? "folder" : "vault");
		});

		// "Show all" button — visible only when a filter is active
		if (activeFilter !== null) {
			const showAllLabel = "Show all";
			const showAllBtn = (toolbar as unknown as AugmentedEl).createEl("button", {
				text: showAllLabel,
				cls: "orbit-dangling-toggle-btn orbit-dangling-show-all-btn",
				attr: {
					"data-action": "clear-filter",
					"aria-label": showAllLabel,
				},
			});

			this.deps.registerDomEvent(showAllBtn, "click", () => {
				this.deps.clearActiveFilter();
			});
		}
	}

	// -------------------------------------------------------------------------
	// Private — aria-live region
	// -------------------------------------------------------------------------

	private renderLiveRegion(container: HTMLElement): HTMLElement {
		const region = (container as unknown as AugmentedEl).createDiv({
			cls: "orbit-dangling-live",
		});
		region.setAttribute("aria-live", "polite");
		return region;
	}

	// -------------------------------------------------------------------------
	// Private — by-target rendering
	// -------------------------------------------------------------------------

	private renderByTarget(
		container: HTMLElement,
		targets: DanglingTarget[],
		scope: RewriteScope,
		settings: OrbitSettings,
		liveRegion: HTMLElement,
		activeFilter: string | null,
	): void {
		const visible = targets.slice(0, RENDER_CAP);
		for (const dt of visible) {
			this.renderTargetGroup(container, dt, scope, settings, liveRegion, activeFilter);
		}

		if (targets.length > RENDER_CAP) {
			const overflow = targets.slice(RENDER_CAP);
			this.renderShowMore(container, overflow.length, () => {
				for (const dt of overflow) {
					this.renderTargetGroup(container, dt, scope, settings, liveRegion, activeFilter);
				}
			});
		}
	}

	private renderShowMore(
		container: HTMLElement,
		remainingCount: number,
		reveal: () => void,
	): void {
		const btn = (container as unknown as AugmentedEl).createEl("button", {
			cls: "orbit-show-more",
			text: `Show ${remainingCount} more…`,
		});

		this.deps.registerDomEvent(btn, "click", () => {
			btn.remove();
			reveal();
		});
	}

	private renderTargetGroup(
		container: HTMLElement,
		dt: DanglingTarget,
		scope: RewriteScope,
		settings: OrbitSettings,
		liveRegion: HTMLElement,
		activeFilter: string | null,
	): void {
		const isHighlighted = activeFilter === dt.target;

		const groupEl = (container as unknown as AugmentedEl).createEl("div", {
			cls: `orbit-dangling-group tree-item${isHighlighted ? " is-highlighted" : ""}`,
			attr: { "data-target": dt.target },
		});

		// Group header row
		const header = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-dangling-group-header tree-item-self",
		});

		// Clicking the target label collapses/expands the source list below it.
		// Bound to the label only so the inline action buttons keep working.
		const labelEl = (header as unknown as AugmentedEl).createSpan({
			cls: "orbit-dangling-group-label is-clickable",
			text: dt.target,
		});
		this.deps.registerDomEvent(labelEl, "click", () => {
			groupEl.classList.toggle("is-collapsed");
		});

		if (settings.showCounts) {
			(header as unknown as AugmentedEl).createSpan({
				cls: "orbit-dangling-count",
				text: String(dt.totalCount),
			});
		}

		// Inline action buttons
		const actions = (header as unknown as AugmentedEl).createDiv({
			cls: "orbit-dangling-actions",
		});

		this.renderActionButtons(actions, dt.target, scope, liveRegion);

		// Children: source occurrences
		const children = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-dangling-group-children tree-item-children",
		});

		for (const occ of dt.occurrences) {
			const occRow = (children as unknown as AugmentedEl).createEl("div", {
				cls: "orbit-dangling-occurrence tree-item is-clickable",
				attr: { "data-path": occ.sourcePath },
			});
			(occRow as unknown as AugmentedEl).createSpan({
				cls: "orbit-dangling-occurrence-label",
				text: occ.sourcePath,
			});
			// Clicking a source row opens that note (Cmd/Ctrl-click → new pane),
			// mirroring RelationsPanel.renderResolvedItem.
			this.deps.registerDomEvent(occRow, "click", (evt) => {
				const newLeaf = Keymap.isModEvent(evt);
				const leaf = this.deps.app.workspace.getLeaf(newLeaf);
				void leaf.openLinkText(occ.sourcePath, occ.sourcePath, newLeaf);
			});
			if (settings.showCounts && occ.count > 1) {
				(occRow as unknown as AugmentedEl).createSpan({
					cls: "orbit-dangling-count",
					text: String(occ.count),
				});
			}
		}

		if (isHighlighted) {
			// scrollIntoView is a no-op in jsdom, but the class is the observable signal in tests
			groupEl.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
		}
	}

	// -------------------------------------------------------------------------
	// Private — by-source rendering
	// -------------------------------------------------------------------------

	private renderBySource(
		container: HTMLElement,
		targets: DanglingTarget[],
		scope: RewriteScope,
		settings: OrbitSettings,
		liveRegion: HTMLElement,
	): void {
		// Invert: build Map<sourcePath → DanglingTarget[]>
		const bySource = this.invertToSource(targets);
		const entries = Array.from(bySource.entries());

		const visible = entries.slice(0, RENDER_CAP);
		for (const [sourcePath, sourceTargets] of visible) {
			this.renderSourceGroup(container, sourcePath, sourceTargets, scope, settings, liveRegion);
		}

		if (entries.length > RENDER_CAP) {
			const overflow = entries.slice(RENDER_CAP);
			this.renderShowMore(container, overflow.length, () => {
				for (const [sourcePath, sourceTargets] of overflow) {
					this.renderSourceGroup(container, sourcePath, sourceTargets, scope, settings, liveRegion);
				}
			});
		}
	}

	private invertToSource(
		targets: DanglingTarget[],
	): Map<string, DanglingTarget[]> {
		const map = new Map<string, DanglingTarget[]>();
		for (const dt of targets) {
			for (const occ of dt.occurrences) {
				let list = map.get(occ.sourcePath);
				if (list === undefined) {
					list = [];
					map.set(occ.sourcePath, list);
				}
				list.push(dt);
			}
		}
		return map;
	}

	private renderSourceGroup(
		container: HTMLElement,
		sourcePath: string,
		sourceTargets: DanglingTarget[],
		scope: RewriteScope,
		settings: OrbitSettings,
		liveRegion: HTMLElement,
	): void {
		const groupEl = (container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-dangling-group tree-item",
			attr: { "data-source": sourcePath },
		});

		const header = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-dangling-group-header tree-item-self",
		});

		(header as unknown as AugmentedEl).createSpan({
			cls: "orbit-dangling-group-label",
			text: sourcePath,
		});

		const children = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-dangling-group-children tree-item-children",
		});

		for (const dt of sourceTargets) {
			const itemEl = (children as unknown as AugmentedEl).createEl("div", {
				cls: "orbit-dangling-target-item tree-item",
			});

			(itemEl as unknown as AugmentedEl).createSpan({
				cls: "orbit-dangling-target-label",
				text: dt.target,
			});

			if (settings.showCounts) {
				const occ = dt.occurrences.find((o) => o.sourcePath === sourcePath);
				if (occ !== undefined) {
					(itemEl as unknown as AugmentedEl).createSpan({
						cls: "orbit-dangling-count",
						text: String(occ.count),
					});
				}
			}

			// Actions available on each target item within source grouping
			const actions = (itemEl as unknown as AugmentedEl).createDiv({
				cls: "orbit-dangling-actions",
			});

			this.renderActionButtons(actions, dt.target, scope, liveRegion);
		}

	}

	// -------------------------------------------------------------------------
	// Private — action buttons
	// -------------------------------------------------------------------------

	private renderActionButtons(
		container: HTMLElement,
		target: string,
		scope: RewriteScope,
		liveRegion: HTMLElement,
	): void {
		this.renderActionBtn(container, "Rename dangling link", "pencil", () => {
			void this.handleRename(target, scope, liveRegion);
		});

		this.renderActionBtn(container, "Alias to existing note", "link", () => {
			void this.handleAlias(target, scope, liveRegion);
		});

		this.renderActionBtn(container, "Create note", "file-plus", () => {
			void this.handleCreate(target, liveRegion);
		});

		this.renderActionBtn(container, "Delete links", "trash", () => {
			void this.handleDelete(target, scope, liveRegion);
		});
	}

	private renderActionBtn(
		container: HTMLElement,
		ariaLabel: string,
		iconId: string,
		onClick: () => void,
	): void {
		const btn = (container as unknown as AugmentedEl).createEl("button", {
			cls: "clickable-icon orbit-dangling-action-btn",
			attr: { "aria-label": ariaLabel },
		});

		setIcon(btn, iconId);

		this.deps.registerDomEvent(btn, "click", (evt) => {
			evt.stopPropagation();
			onClick();
		});
	}

	// -------------------------------------------------------------------------
	// Private — action handlers
	// -------------------------------------------------------------------------

	private async handleRename(
		target: string,
		scope: RewriteScope,
		liveRegion: HTMLElement,
	): Promise<void> {
		try {
			const preview = await this.deps.service.previewRename(target, scope);
			const modal = new this.deps.ConfirmRewriteModal(this.deps.app, {
				preview,
				kind: "rename",
				onConfirm: (newName: string) => {
					void this.deps.service.applyRename(target, newName, scope)
						.then((result) => { this.surfaceResult(result, liveRegion); })
						.catch((err) => { this.notifyError("Rename", err); });
				},
			});
			modal.open();
		} catch (err) {
			this.notifyError("Rename", err);
		}
	}

	private async handleAlias(
		target: string,
		scope: RewriteScope,
		liveRegion: HTMLElement,
	): Promise<void> {
		try {
			this.deps.log?.("alias: start", { target, scope });
			// Pick an existing note via NoteFilePicker (ADR-6: alias target must be
			// an existing note, not a folder, so the wikilink resolves correctly).
			const picker = new this.deps.notePicker(this.deps.app);
			this.deps.log?.("alias: opening note picker");
			const note = await picker.pickNote();
			this.deps.log?.("alias: picker resolved", { note: note?.path ?? null });
			if (note === null) return;

			const notePath = note.path;
			const preview = await this.deps.service.previewRename(target, scope);
			this.deps.log?.("alias: preview", preview);
			const modal = new this.deps.ConfirmRewriteModal(this.deps.app, {
				preview,
				kind: "alias",
				onConfirm: (_name: string) => {
					this.deps.log?.("alias: confirmed → applyAlias", { target, notePath });
					void this.deps.service.applyAlias(target, notePath, scope)
						.then((result) => {
							this.deps.log?.("alias: applyAlias result", result);
							this.surfaceResult(result, liveRegion);
						})
						.catch((err) => { this.notifyError("Alias", err); });
				},
			});

			// Defer to a fresh macrotask so the just-closed note picker is fully
			// torn down before this dialog opens — otherwise Obsidian can swallow
			// a modal opened during another modal's close cycle.
			window.setTimeout(() => {
				try {
					this.deps.log?.("alias: opening confirm modal");
					modal.open();
					this.deps.log?.("alias: modal.open() returned");
				} catch (err) {
					this.notifyError("Alias", err);
				}
			}, 0);
		} catch (err) {
			this.notifyError("Alias", err);
		}
	}

	private async handleCreate(
		target: string,
		liveRegion: HTMLElement,
	): Promise<void> {
		try {
			const picker = new this.deps.folderPicker(this.deps.app);
			const folder = await picker.pickFolder();
			const settings = this.deps.getSettings();

			const result = await this.deps.createNote(
				target,
				this.deps.app,
				settings,
				folder,
			);

			const msg = result.existed
				? `Note "${result.file.path}" already exists.`
				: `Created "${result.file.path}".`;

			new Notice(msg);
			this.updateLiveRegion(liveRegion, msg);
		} catch (err) {
			this.notifyError("Create note", err);
		}
	}

	private async handleDelete(
		target: string,
		scope: RewriteScope,
		liveRegion: HTMLElement,
	): Promise<void> {
		try {
			const preview = await this.deps.service.previewRename(target, scope);

			// modalRef holds the instance so onConfirm can read modal.onlyInThisNote,
			// which is updated by the "Only in this note" checkbox in renderDeleteConfirm.
			const modalRef: { instance: InstanceType<ConfirmRewriteModalConstructor> | null } = { instance: null };

			const modal = new this.deps.ConfirmRewriteModal(this.deps.app, {
				preview,
				kind: "delete",
				onConfirm: (_name: string) => {
					const onlyInNote = modalRef.instance?.onlyInThisNote ?? false;
					void this.deps.service.applyDelete(target, scope, onlyInNote)
						.then((result) => { this.surfaceResult(result, liveRegion); })
						.catch((err) => { this.notifyError("Delete", err); });
				},
			});

			modalRef.instance = modal;
			modal.open();
		} catch (err) {
			this.notifyError("Delete", err);
		}
	}

	/** Surface an otherwise-silent handler error as a Notice (and to the console). */
	private notifyError(action: string, err: unknown): void {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[Orbit] ${action} failed:`, err);
		new Notice(`${action} failed: ${msg}`);
	}

	// -------------------------------------------------------------------------
	// Private — surface result
	// -------------------------------------------------------------------------

	private surfaceResult(result: BulkResult, liveRegion: HTMLElement): void {
		const total = result.filesSucceeded + result.filesFailed.length;
		const failed = result.filesFailed.length;
		const msg = failed === 0
			? `Updated ${result.filesSucceeded} of ${total} files.`
			: `Updated ${result.filesSucceeded} of ${total} files; ${failed} failed.`;

		// Notice is emitted by LinkRewriteService.surfaceBulkProgress — do not duplicate here.
		this.updateLiveRegion(liveRegion, msg);
	}

	private updateLiveRegion(liveRegion: HTMLElement, msg: string): void {
		liveRegion.textContent = msg;
	}

	// -------------------------------------------------------------------------
	// Private — empty state
	// -------------------------------------------------------------------------

	private renderEmptyState(container: HTMLElement): void {
		(container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-dangling-empty",
			text: "No dangling links in this scope.",
		});
	}

	// -------------------------------------------------------------------------
	// Private — scope helper
	// -------------------------------------------------------------------------

	private buildScope(): RewriteScope {
		const scope = this.deps.getScope();
		if (scope === "folder") {
			return { folder: this.deps.getFolderPath() };
		}
		return {};
	}
}
