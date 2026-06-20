import { Plugin, addIcon, debounce, TFile, TAbstractFile, MarkdownView } from "obsidian";
import type { Debouncer } from "obsidian";
import { SettingsTab } from "settings/SettingsTab";
import { DEFAULT_SETTINGS, type OrbitSettings } from "types/index";
import { OrbitView, VIEW_TYPE } from "view/OrbitView";
import type { RelationsDeps, DanglingDeps, RecentDeps } from "view/OrbitView";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import { ExclusionMatcher } from "shared/ExclusionMatcher";
import { LinkRewriteService } from "links/LinkRewriteService";
import { MentionLinkService } from "links/MentionLinkService";
import { NotePickerModal, NoteFilePicker } from "modals/NotePickerModal";
import { RenameTargetPicker } from "modals/RenameTargetPicker";
import { ConfirmRewriteModal } from "modals/ConfirmRewriteModal";
import { createNote } from "links/createNote";
import { RecentFilesStore } from "recent/RecentFilesStore";
import { DragInsertHelper } from "recent/DragInsertHelper";
import { createLogger } from "shared/logger";
import type { Logger } from "shared/logger";

/**
 * Custom "orbit" icon — a central body, a tilted orbit ring, and a satellite.
 * Inner SVG markup for a 0 0 100 100 viewBox; uses currentColor so it adopts
 * Obsidian's icon theming. Registered via addIcon() and used as the view icon.
 */
const ORBIT_ICON_ID = "orbit";
const ORBIT_ICON_SVG =
	'<circle cx="50" cy="50" r="12" fill="currentColor"/>' +
	'<ellipse cx="50" cy="50" rx="42" ry="20" fill="none" stroke="currentColor" stroke-width="7" transform="rotate(-25 50 50)"/>' +
	'<circle cx="84" cy="33" r="8" fill="currentColor"/>';

export default class OrbitPlugin extends Plugin {
	settings: OrbitSettings = DEFAULT_SETTINGS;

	/** Plugin-scoped link graph index — survives view open/close. */
	_index: LinkGraphIndex = new LinkGraphIndex(
		{ resolvedLinks: {}, unresolvedLinks: {} },
	);

	/** Plugin-scoped unlinked-mentions service — survives view open/close. */
	_mentionService!: MentionLinkService;

	/** Plugin-scoped recent-files store — survives view open/close. */
	_recentStore: RecentFilesStore = new RecentFilesStore({
		getSettings: () => this.settings,
		saveSettings: () => this.saveSettings(),
		isExcluded: (path: string) => this._isExcluded(path),
	});

	/** Debounced handler for active-leaf-change events (trailing). */
	_refreshDebouncer: Debouncer<[], void> | null = null;

	/** True once the index has been built (at layout-ready). */
	private _indexBuilt = false;

	/**
	 * Set when a file is created/deleted/renamed AFTER the initial build. These
	 * structural changes alter OTHER files' link resolution (e.g. creating a note
	 * clears danglings that referenced it) — a cross-file effect the per-file
	 * 'changed' handler can't see. The next 'resolved' (fired once the cache has
	 * re-resolved) consumes this flag to trigger a single debounced rebuild, so
	 * plain edits never pay for a full rebuild.
	 */
	private _structuralChange = false;

	/** Debug logger — gated by the debugLogging setting (read live). */
	_log: Logger = createLogger(() => this.settings.debugLogging);

	async onload(): Promise<void> {
		await this.loadSettings();

		addIcon(ORBIT_ICON_ID, ORBIT_ICON_SVG);

		this._index = new LinkGraphIndex(this.app.metadataCache);

		this._mentionService = new MentionLinkService(
			this.app.vault,
			this.app.fileManager,
			this.app.metadataCache,
			this._index,
			(path: string) => this._isExcluded(path),
		);

		this.registerView(VIEW_TYPE, (leaf) => new OrbitView(
			leaf,
			undefined,
			this._buildRelationsDeps(),
			this._buildDanglingDeps(),
			this._buildRecentDeps(),
		));

		this.addCommand({
			id: "open",
			name: "Open",
			callback: () => this.activateView(),
		});

		this.addSettingTab(new SettingsTab(this.app, this));

		this._wireEvents();

		console.debug(`${this.manifest.name} loaded (v${this.manifest.version})`);
		this._log.debug("onload complete", {
			debugLogging: this.settings.debugLogging,
			defaultTab: this.settings.defaultTab,
		});
	}

	onunload(): void {
		// Intentionally do NOT detach leaves — Obsidian restores them from layout.
		console.debug(`${this.manifest.name} unloaded`);
	}

	async onExternalSettingsChange(): Promise<void> {
		await this.loadSettings();
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<OrbitSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ---------------------------------------------------------------------------
	// Private — Relations deps factory
	// ---------------------------------------------------------------------------

	/**
	 * Build the RelationsDeps bundle the relations panel needs.
	 *
	 * isExcluded: delegates to _isExcluded (single source of truth).
	 *
	 * onManage: (target) → void
	 *   Switches the active OrbitView to the 'dangling' tab and stashes the
	 *   target for T5.1 deep-link wiring. Uses dynamic view lookup so it works
	 *   regardless of how many leaves are open.
	 */
	private _buildRelationsDeps(): RelationsDeps {
		return {
			index: this._index,
			getSettings: () => this.settings,
			// Cast: RelationsPanelApp is a structural subset of Obsidian App; the
			// overloaded getLeaf signatures are compatible at runtime but not
			// assignable without this cast.
			app: this.app as unknown as RelationsDeps["app"],
			isExcluded: (path: string): boolean => this._isExcluded(path),
			mentions: this._mentionService,
			onManage: (target: string): void => {
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
				for (const leaf of leaves) {
					const view = leaf.view;
					if (view instanceof OrbitView) {
						// setState sets activeDanglingFilter, which DanglingPanel reads
						// directly via getActiveFilter() on each render.
						void view.setState(
							{ ...view.getState(), activeTab: "dangling", activeDanglingFilter: target },
							{ history: false },
						);
					}
				}
			},
		};
	}

	// ---------------------------------------------------------------------------
	// Private — Dangling deps factory
	// ---------------------------------------------------------------------------

	/**
	 * Build the DanglingDeps bundle the dangling panel needs.
	 *
	 * service: LinkRewriteService constructed with the real vault, fileManager,
	 *   metadataCache, index, and workspace. Cast structurally to avoid the
	 *   overloaded-signature incompatibility (same pattern as relations app cast).
	 * ConfirmRewriteModal, folderPicker, notePicker: constructor references cast
	 *   structurally — the real App is a superset of DanglingPanelApp so the
	 *   constructors are runtime-compatible despite the nominal type mismatch.
	 * createNote: passed directly (its AppMinimal structural type accepts the
	 *   real App at runtime).
	 */
	private _buildDanglingDeps(): DanglingDeps {
		// Cast the real Obsidian MetadataCache to the structural subset expected
		// by LinkRewriteService (getFileCache signature differs nominally).
		type McArg = ConstructorParameters<typeof LinkRewriteService>[2];

		return {
			index: this._index,
			getSettings: () => this.settings,
			// Cast: DanglingPanelApp is a structural subset of Obsidian App; the
			// overloaded getLeaf signatures are runtime-compatible but not
			// nominally assignable (same pattern as RelationsDeps.app).
			app: this.app as unknown as DanglingDeps["app"],
			service: new LinkRewriteService(
				this.app.vault,
				this.app.fileManager,
				this.app.metadataCache as unknown as McArg,
				this._index,
			),
			// Cast: real App constructors are supersets of DanglingPanelApp —
			// runtime-compatible but not nominally assignable.
			ConfirmRewriteModal: ConfirmRewriteModal as unknown as DanglingDeps["ConfirmRewriteModal"],
			folderPicker: NotePickerModal as unknown as DanglingDeps["folderPicker"],
			notePicker: NoteFilePicker as unknown as DanglingDeps["notePicker"],
			renameTargetPicker: RenameTargetPicker as unknown as DanglingDeps["renameTargetPicker"],
			createNote,
			log: (...args: unknown[]): void => this._log.debug(...args),
		};
	}

	// ---------------------------------------------------------------------------
	// Private — Recent deps factory
	// ---------------------------------------------------------------------------

	/**
	 * Returns true when a file at the given path should be excluded from recents.
	 * Resolves the path to a TFile via vault (for tag exclusion); falls back to
	 * path-only exclusion for unresolved paths.
	 */
	private _isExcluded(path: string): boolean {
		const s = this.settings;
		const matcher = new ExclusionMatcher(s.excludePathPatterns, s.excludeTagPatterns);
		const abstract = this.app.vault.getAbstractFileByPath(path);
		if (abstract instanceof TFile) {
			return matcher.isExcluded(abstract, this.app.metadataCache);
		}
		return matcher.isPathExcluded(path);
	}

	/** Build the RecentDeps bundle the recent panel needs. */
	private _buildRecentDeps(): RecentDeps {
		const dragHelper = new DragInsertHelper({
			getFirstLinkpathDest: (lp, sp) => this.app.metadataCache.getFirstLinkpathDest(lp, sp),
			getActiveMarkdownView: () => this.app.workspace.getActiveViewOfType(MarkdownView),
			dragManager: this.app.dragManager,
		});

		return {
			store: this._recentStore,
			app: this.app as unknown as RecentDeps["app"],
			dragHelper,
		};
	}

	// ---------------------------------------------------------------------------
	// Private — event wiring
	// ---------------------------------------------------------------------------

	private _wireEvents(): void {
		this._wireDebouncedLeafChange();
		this._wireVaultEvents();
		this._wireMetadataCacheEvents();
	}

	private _wireDebouncedLeafChange(): void {
		const refreshFn = (): void => {
			this._repaintActivePanel();
		};

		const debounced = debounce(refreshFn, this.settings.refreshDebounceMs, true);
		this._refreshDebouncer = debounced;

		// Register cleanup so _runCleanup() cancels the timer.
		this.register(() => {
			this._refreshDebouncer?.cancel();
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				debounced();
			}),
		);
	}

	private _wireVaultEvents(): void {
		// A new file changes other files' resolution (links to it stop dangling).
		// The file's own (empty) edges are handled by 'changed'; here we only flag
		// the structural change for the next 'resolved' rebuild. Guarded by
		// _indexBuilt so the flood of 'create' events during initial load is ignored.
		this.registerEvent(
			this.app.vault.on("create", () => {
				if (this._indexBuilt) this._structuralChange = true;
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				this._index.renameFile(oldPath, file.path);
				if (file instanceof TFile) {
					void this._recentStore.rename(oldPath, file.path, file.basename);
				}
				this._mentionService.invalidate();
				if (this._indexBuilt) this._structuralChange = true;
				this._repaintActivePanel();
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file: { path: string }) => {
				this._index.removeFile(file.path);
				void this._recentStore.delete(file.path);
				this._mentionService.invalidate();
				if (this._indexBuilt) this._structuralChange = true;
				this._repaintActivePanel();
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (file: TFile | null) => {
				if (file instanceof TFile && file.extension === "md") {
					void this._recentStore.onFileOpen(file.path, file.basename);
					this._repaintActivePanel();
				}
			}),
		);
	}

	private _wireMetadataCacheEvents(): void {
		// Register 'changed' eagerly (not inside onLayoutReady) so it fires
		// for all cache updates from the start.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file: { path: string }) => {
				this._index.updateFile(file.path);
				this._mentionService.invalidate();
				this._repaintActivePanel();
			}),
		);

		// Build the index at layout-ready. The metadata cache is already populated
		// at this point, and 'resolved' may have ALREADY fired (e.g. the plugin was
		// enabled while the vault was open) — so we must not wait for it, or the
		// index would stay empty and Relations/Dangling would show 0.
		this.app.workspace.onLayoutReady(() => {
			if (!this._indexBuilt) {
				this._index.buildFull();
				this._indexBuilt = true;
				this._log.debug("index built at onLayoutReady", {
					resolvedFiles: Object.keys(this.app.metadataCache.resolvedLinks ?? {}).length,
					unresolvedFiles: Object.keys(this.app.metadataCache.unresolvedLinks ?? {}).length,
				});
				// An Orbit pane opened before this point rendered against an empty
				// index; repaint so its counts update from 0 to the real values.
				this._repaintActivePanel();
			}

			// Rebuild (debounced) only when a structural change (file create/delete/
			// rename) has happened since the last build. 'resolved' fires after the
			// cache finishes re-resolving — the correct moment to rebuild, since at
			// vault-event time the cache is still stale. Plain edits also fire
			// 'resolved' but are already handled incrementally by 'changed', so we
			// skip the expensive full rebuild for them.
			const rebuildOnResolved = debounce((): void => {
				this._index.buildFull();
				this._mentionService.invalidate();
				this._repaintActivePanel();
				this._log.debug("index rebuilt after structural change");
			}, this.settings.refreshDebounceMs, true);
			this.register(() => rebuildOnResolved.cancel());

			this.registerEvent(
				this.app.metadataCache.on("resolved", () => {
					if (!this._structuralChange) return;
					this._structuralChange = false;
					this._log.debug("resolved + structural change → debounced rebuild");
					rebuildOnResolved();
				}),
			);
		});
	}

	/** Repaint the active OrbitView panel if a view is open. */
	private _repaintActivePanel(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof OrbitView) {
				view.refreshActivePanel();
			}
		}
	}

	private async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		const first = existing[0];
		if (first !== undefined) {
			this.app.workspace.setActiveLeaf(first, { focus: true });
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;

		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}
}
