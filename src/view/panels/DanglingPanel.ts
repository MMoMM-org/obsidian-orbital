/**
 * DanglingPanel — T3.4
 *
 * Renders the Dangling tab: a grouped tree of unresolved wikilink targets
 * with inline actions (rename, alias, create, delete).
 *
 * Design decisions:
 * - Pure render: `render(container)` always rebuilds from scratch; callers
 *   re-invoke on vault changes or toggle events (driven by OrbitalView).
 * - Default grouping: by-target (ADR-4). Toggle switches to by-source.
 * - Default scope: vault. Toggle switches to folder (uses getFolderPath()).
 * - No innerHTML: all nodes via createEl/createDiv/createSpan (CON-3).
 * - Actions use mobile-reachable clickable-icon buttons (not hover-only).
 * - DOM listeners routed through injected registerDomEvent for lifecycle safety.
 * - Bulk results surfaced via Notice + aria-live="polite" region.
 * - "Manage →" deep-link: reads activeDanglingFilter (set by OrbitalView.setState),
 *   scrolls to and highlights the matching group row.
 */

import { Keymap, Notice, prepareFuzzySearch, setIcon } from "obsidian";
import type { LinkGraphIndex } from "graph/LinkGraphIndex";
import type {
	OrbitalSettings,
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
		getMarkdownFiles(): Array<{ basename: string }>;
	};
	fileManager: {
		getNewFileParent(sourcePath: string): { path: string };
	};
	workspace: {
		getLeaf(newLeaf: boolean | string): {
			// The leaf is already chosen by getLeaf; openLinkText's 3rd arg is
			// openViewState (optional), NOT newLeaf — passing a truthy value throws.
			openLinkText(path: string, sourcePath: string, openViewState?: unknown): void | Promise<void>;
		};
	};
}

interface ServiceLike {
	previewRename(target: string, scope: RewriteScope): Promise<RewritePreview>;
	applyRename(target: string, newName: string, scope: RewriteScope): Promise<BulkResult>;
	applyAlias(target: string, realNotePath: string, scope: RewriteScope): Promise<BulkResult>;
	applyDelete(target: string, scope: RewriteScope, restrictToSource?: string | null): Promise<BulkResult>;
}

interface ConfirmRewriteModalConstructor {
	new (
		app: DanglingPanelApp,
		opts: {
			preview: RewritePreview;
			kind: RewriteKind;
			onConfirm: (name: string) => void;
			existingNoteNames?: string[];
			pickExisting?: () => Promise<string | null>;
			deleteSourceNote?: string;
			deleteSourcePreview?: RewritePreview;
		},
	): { open(): void; onlyInThisNote?: boolean };
}

interface FolderPickerConstructor {
	new (app: DanglingPanelApp, log?: LogFn): { pickFolder(): Promise<TFolder | null> };
}

interface NotePickerConstructor {
	new (app: DanglingPanelApp, log?: LogFn): { pickNote(): Promise<TFile | null> };
}

interface RenameTargetPickerConstructor {
	new (
		app: DanglingPanelApp,
		index: LinkGraphIndex,
		currentTarget: string,
		log?: LogFn,
	): { pick(): Promise<string | null> };
}

type CreateNoteFn = (
	target: string,
	app: DanglingPanelApp,
	settings: OrbitalSettings,
	pickerFolder: TFolder | null,
) => Promise<{ file: { path: string }; existed: boolean }>;

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface DanglingPanelDeps {
	/** Pre-built link graph index. */
	index: LinkGraphIndex;
	/** Returns current plugin settings (called on each render). */
	getSettings: () => OrbitalSettings;
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
	/** Persists the active filter target in OrbitalView state. */
	setActiveFilter: (target: string) => void;
	/** Clears the active filter and restores the full list. */
	clearActiveFilter: () => void;
	/** Returns the current free-text fuzzy search query (empty = show all). */
	getSearchQuery: () => string;
	/** Persists the search query (triggers a re-render via the view). */
	setSearchQuery: (query: string) => void;
	/** LinkRewriteService instance (or compatible mock). */
	service: ServiceLike;
	/** ConfirmRewriteModal constructor. */
	ConfirmRewriteModal: ConfirmRewriteModalConstructor;
	/** Folder picker modal constructor (NotePickerModal). */
	folderPicker: FolderPickerConstructor;
	/** Note picker modal constructor (NoteFilePicker). */
	notePicker: NotePickerConstructor;
	/** Combined rename/merge target picker constructor (RenameTargetPicker). */
	renameTargetPicker: RenameTargetPickerConstructor;
	/** createNote function. */
	createNote: CreateNoteFn;
	/** Optional debug logger (gated by the debugLogging setting). */
	log?: LogFn;
	/**
	 * Signals the owning plugin that a bulk rewrite changed file content in a way
	 * that affects link resolution (alias/rename/delete). The vault's link
	 * resolution maps are stale at edit time, so the panel can't refresh from the
	 * index immediately; the plugin schedules a rebuild on the next metadata-cache
	 * 'resolved' event, after which the dangling list re-renders with fresh data.
	 * Optional so tests and the placeholder wiring can omit it.
	 */
	requestRebuild?: () => void;
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

		// Read the persistent active filter (set via OrbitalView.setState by the
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
		const filtered = activeFilter !== null
			? allTargets.filter((dt) => dt.target === activeFilter)
			: allTargets;

		// Apply the free-text fuzzy search over target + source paths.
		const targets = this.applySearch(filtered);

		if (targets.length === 0) {
			this.renderNoMatches(container);
			return;
		}

		if (grouping === "target") {
			this.renderByTarget(container, targets, scope, settings, liveRegion, activeFilter);
		} else {
			this.renderBySource(container, targets, scope, settings, liveRegion);
		}
	}

	// -------------------------------------------------------------------------
	// Private — fuzzy search
	// -------------------------------------------------------------------------

	/**
	 * Filter targets by the current fuzzy query. A target is kept when the query
	 * fuzzy-matches its target name OR any of its source paths. An empty query
	 * returns the list unchanged.
	 */
	private applySearch(targets: DanglingTarget[]): DanglingTarget[] {
		const query = this.deps.getSearchQuery().trim();
		if (query === "") return targets;

		const match = prepareFuzzySearch(query);
		return targets.filter(
			(dt) =>
				match(dt.target) !== null ||
				dt.occurrences.some((occ) => match(occ.sourcePath) !== null),
		);
	}

	// -------------------------------------------------------------------------
	// Private — toolbar
	// -------------------------------------------------------------------------

	private renderToolbar(container: HTMLElement, activeFilter: string | null): void {
		const toolbar = (container as unknown as AugmentedEl).createDiv({
			cls: "orbital-dangling-toolbar",
		});

		const grouping = this.deps.getGrouping();
		const scope = this.deps.getScope();

		// Grouping toggle
		const groupingLabel = grouping === "target" ? "Group by source" : "Group by target";
		const groupingBtn = (toolbar as unknown as AugmentedEl).createEl("button", {
			text: groupingLabel,
			cls: "orbital-dangling-toggle-btn",
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
			cls: "orbital-dangling-toggle-btn",
			attr: {
				"data-action": "toggle-scope",
				"aria-label": scope === "vault" ? "Switch to folder scope" : "Switch to vault scope",
			},
		});

		this.deps.registerDomEvent(scopeBtn, "click", () => {
			this.deps.setScope(scope === "vault" ? "folder" : "vault");
		});

		// Fuzzy search box — sits to the right of the scope toggle.
		this.renderSearchBox(toolbar);

		// "Show all" button — visible only when a filter is active
		if (activeFilter !== null) {
			const showAllLabel = "Show all";
			const showAllBtn = (toolbar as unknown as AugmentedEl).createEl("button", {
				text: showAllLabel,
				cls: "orbital-dangling-toggle-btn orbital-dangling-show-all-btn",
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

	/**
	 * Render the fuzzy search input into the toolbar. Wires its `input` event to
	 * setSearchQuery (which re-renders the panel) and restores focus + caret
	 * after that re-render so typing stays uninterrupted.
	 */
	private renderSearchBox(toolbar: HTMLElement): void {
		const query = this.deps.getSearchQuery();

		const wrapper = (toolbar as unknown as AugmentedEl).createDiv({
			cls: "orbital-dangling-search",
		});

		const input = (wrapper as unknown as AugmentedEl).createEl("input", {
			cls: "orbital-dangling-search-input",
			attr: {
				type: "search",
				placeholder: "Search source or target…",
				"aria-label": "Search dangling links by source or target",
			},
		}) as HTMLInputElement;
		input.value = query;

		this.deps.registerDomEvent(input, "input", () => {
			this.deps.setSearchQuery(input.value);
		});

		// Focus restoration after the re-render is owned by OrbitalView.renderPanel,
		// which only re-focuses this input when it actually held focus before the
		// rebuild. Doing it here unconditionally (whenever the query was non-empty)
		// stole focus from the editor on every passive repaint.
	}

	// -------------------------------------------------------------------------
	// Private — aria-live region
	// -------------------------------------------------------------------------

	private renderLiveRegion(container: HTMLElement): HTMLElement {
		const region = (container as unknown as AugmentedEl).createDiv({
			cls: "orbital-dangling-live",
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
		settings: OrbitalSettings,
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
			cls: "orbital-show-more",
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
		settings: OrbitalSettings,
		liveRegion: HTMLElement,
		activeFilter: string | null,
	): void {
		const isHighlighted = activeFilter === dt.target;

		const groupEl = (container as unknown as AugmentedEl).createEl("div", {
			cls: `orbital-dangling-group tree-item${isHighlighted ? " is-highlighted" : ""}`,
			attr: { "data-target": dt.target },
		});

		// Group header row
		const header = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbital-dangling-group-header tree-item-self",
		});

		// Clicking the target label collapses/expands the source list below it.
		// Bound to the label only so the inline action buttons keep working.
		const labelEl = (header as unknown as AugmentedEl).createSpan({
			cls: "orbital-dangling-group-label is-clickable",
			text: dt.target,
		});
		this.deps.registerDomEvent(labelEl, "click", () => {
			groupEl.classList.toggle("is-collapsed");
		});

		if (settings.showCounts) {
			(header as unknown as AugmentedEl).createSpan({
				cls: "orbital-dangling-count",
				text: String(dt.totalCount),
			});
		}

		// Inline action buttons
		const actions = (header as unknown as AugmentedEl).createDiv({
			cls: "orbital-dangling-actions",
		});

		this.renderActionButtons(actions, dt.target, scope, liveRegion);

		// Children: source occurrences
		const children = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbital-dangling-group-children tree-item-children",
		});

		for (const occ of dt.occurrences) {
			const occRow = (children as unknown as AugmentedEl).createEl("div", {
				cls: "orbital-dangling-occurrence tree-item is-clickable",
				attr: { "data-path": occ.sourcePath },
			});
			(occRow as unknown as AugmentedEl).createSpan({
				cls: "orbital-dangling-occurrence-label",
				text: occ.sourcePath,
			});
			// Clicking a source row opens that note (Cmd/Ctrl-click → new pane),
			// mirroring RelationsPanel.renderResolvedItem. getLeaf picks the leaf;
			// openLinkText takes NO 3rd arg (it is openViewState, not newLeaf — a
			// truthy value there throws "Cannot create property 'state'").
			this.deps.registerDomEvent(occRow, "click", (evt) => {
				const leaf = this.deps.app.workspace.getLeaf(Keymap.isModEvent(evt));
				void leaf.openLinkText(occ.sourcePath, occ.sourcePath);
			});
			if (settings.showCounts && occ.count > 1) {
				(occRow as unknown as AugmentedEl).createSpan({
					cls: "orbital-dangling-count",
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
		settings: OrbitalSettings,
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
		settings: OrbitalSettings,
		liveRegion: HTMLElement,
	): void {
		const groupEl = (container as unknown as AugmentedEl).createEl("div", {
			cls: "orbital-dangling-group tree-item",
			attr: { "data-source": sourcePath },
		});

		const header = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbital-dangling-group-header tree-item-self",
		});

		// Clicking the source label opens that note (Cmd/Ctrl-click → new pane),
		// mirroring the source occurrence rows in by-target grouping. The children
		// here are dangling targets (not openable), so the header is the only
		// navigation affordance in this grouping.
		const labelEl = (header as unknown as AugmentedEl).createSpan({
			cls: "orbital-dangling-group-label is-clickable",
			text: sourcePath,
		});
		this.deps.registerDomEvent(labelEl, "click", (evt) => {
			// getLeaf picks the leaf; openLinkText takes NO 3rd arg (it is
			// openViewState, not newLeaf — a truthy value there throws).
			const leaf = this.deps.app.workspace.getLeaf(Keymap.isModEvent(evt));
			void leaf.openLinkText(sourcePath, sourcePath);
		});

		const children = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbital-dangling-group-children tree-item-children",
		});

		for (const dt of sourceTargets) {
			const itemEl = (children as unknown as AugmentedEl).createEl("div", {
				cls: "orbital-dangling-target-item tree-item",
			});

			(itemEl as unknown as AugmentedEl).createSpan({
				cls: "orbital-dangling-target-label",
				text: dt.target,
			});

			if (settings.showCounts) {
				const occ = dt.occurrences.find((o) => o.sourcePath === sourcePath);
				if (occ !== undefined) {
					(itemEl as unknown as AugmentedEl).createSpan({
						cls: "orbital-dangling-count",
						text: String(occ.count),
					});
				}
			}

			// Actions available on each target item within source grouping.
			// Pass sourcePath so delete can offer "Only in note: <name>" scoping.
			const actions = (itemEl as unknown as AugmentedEl).createDiv({
				cls: "orbital-dangling-actions",
			});

			this.renderActionButtons(actions, dt.target, scope, liveRegion, sourcePath);
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
		sourcePath?: string,
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
			void this.handleDelete(target, scope, liveRegion, sourcePath);
		});
	}

	private renderActionBtn(
		container: HTMLElement,
		ariaLabel: string,
		iconId: string,
		onClick: () => void,
	): void {
		const btn = (container as unknown as AugmentedEl).createEl("button", {
			cls: "clickable-icon orbital-dangling-action-btn",
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
			const existingNoteNames = this.deps.app.vault
				.getMarkdownFiles()
				.map((f) => f.basename);
			const modal = new this.deps.ConfirmRewriteModal(this.deps.app, {
				preview,
				kind: "rename",
				existingNoteNames,
				pickExisting: () =>
					new this.deps.renameTargetPicker(
						this.deps.app,
						this.deps.index,
						target,
						this.deps.log,
					).pick(),
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
			const picker = new this.deps.notePicker(this.deps.app, this.deps.log);
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
			const picker = new this.deps.folderPicker(this.deps.app, this.deps.log);
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
		sourcePath?: string,
	): Promise<void> {
		try {
			this.deps.log?.("delete: start", { target, scope, sourcePath: sourcePath ?? null });
			const preview = await this.deps.service.previewRename(target, scope);
			this.deps.log?.("delete: preview", preview);

			// In by-source grouping the delete is triggered from a specific source
			// note, so offer an "Only in note: <name>" checkbox (pre-checked). In
			// by-target grouping there is no single source, so no checkbox is shown.
			const sourceNoteName = sourcePath !== undefined ? noteName(sourcePath) : undefined;

			// Source-scoped preview counts so the dialog reflects what a
			// "Only in note" delete will really modify (just that one file).
			let deleteSourcePreview: RewritePreview | undefined;
			if (sourcePath !== undefined) {
				const file = preview.files.find((f) => f.path === sourcePath);
				deleteSourcePreview = {
					occurrences: file?.count ?? 0,
					files: file !== undefined ? [file] : [],
				};
			}

			// modalRef holds the instance so onConfirm can read modal.onlyInThisNote,
			// which is updated by the "Only in note" checkbox in renderDeleteConfirm.
			const modalRef: { instance: InstanceType<ConfirmRewriteModalConstructor> | null } = { instance: null };

			const modal = new this.deps.ConfirmRewriteModal(this.deps.app, {
				preview,
				kind: "delete",
				deleteSourceNote: sourceNoteName,
				deleteSourcePreview,
				onConfirm: (_name: string) => {
					// Scope to the source note only when it exists and the checkbox is
					// still checked; otherwise delete across every source in scope.
					const restrictToSource =
						sourcePath !== undefined && (modalRef.instance?.onlyInThisNote ?? false)
							? sourcePath
							: null;
					this.deps.log?.("delete: confirmed → applyDelete", { target, restrictToSource });
					void this.deps.service.applyDelete(target, scope, restrictToSource)
						.then((result) => {
							this.deps.log?.("delete: applyDelete result", result);
							this.surfaceResult(result, liveRegion);
						})
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
		console.error(`[Orbital] ${action} failed:`, err);
		new Notice(`${action} failed: ${msg}`);
	}

	// -------------------------------------------------------------------------
	// Private — surface result
	// -------------------------------------------------------------------------

	private surfaceResult(result: BulkResult, liveRegion: HTMLElement): void {
		const total = result.filesSucceeded + result.filesFailed.length;
		const failed = result.filesFailed.length;
		const links = result.occurrencesModified;
		const suffix = links === undefined ? "" : ` (${links} ${links === 1 ? "link" : "links"})`;
		const base = failed === 0
			? `Updated ${result.filesSucceeded} of ${total} files`
			: `Updated ${result.filesSucceeded} of ${total} files; ${failed} failed`;

		// Notice is emitted by LinkRewriteService.surfaceBulkProgress — do not duplicate here.
		this.updateLiveRegion(liveRegion, `${base}${suffix}.`);

		// The rewrite changed link resolution; ask the plugin to rebuild the index
		// once the metadata cache re-resolves so the dangling list reflects reality.
		this.deps.requestRebuild?.();
	}

	private updateLiveRegion(liveRegion: HTMLElement, msg: string): void {
		liveRegion.textContent = msg;
	}

	// -------------------------------------------------------------------------
	// Private — empty state
	// -------------------------------------------------------------------------

	private renderEmptyState(container: HTMLElement): void {
		(container as unknown as AugmentedEl).createEl("div", {
			cls: "orbital-dangling-empty",
			text: "No dangling links in this scope.",
		});
	}

	/**
	 * Shown when dangling links exist but none match the current search query.
	 * The toolbar (with the search box) stays rendered so the user can clear it.
	 */
	private renderNoMatches(container: HTMLElement): void {
		(container as unknown as AugmentedEl).createEl("div", {
			cls: "orbital-dangling-empty",
			text: "No dangling links match the search.",
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

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Derive a friendly note name from a vault path for display in UI labels —
 * strips the directory and a trailing ".md" extension (e.g.
 * "notes/Slip Box.md" → "Slip Box"). Falls back to the raw path if empty.
 */
function noteName(path: string): string {
	const base = path.split("/").pop() ?? path;
	return base.replace(/\.md$/i, "") || path;
}
