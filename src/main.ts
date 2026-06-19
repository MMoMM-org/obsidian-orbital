import { Plugin, debounce, TFile } from "obsidian";
import type { Debouncer } from "obsidian";
import { SettingsTab } from "settings/SettingsTab";
import { DEFAULT_SETTINGS, type OrbitSettings } from "types/index";
import { OrbitView, VIEW_TYPE } from "view/OrbitView";
import type { RelationsDeps, DanglingDeps } from "view/OrbitView";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import { ExclusionMatcher } from "shared/ExclusionMatcher";
import { LinkRewriteService } from "links/LinkRewriteService";
import { NotePickerModal, NoteFilePicker } from "modals/NotePickerModal";
import { ConfirmRewriteModal } from "modals/ConfirmRewriteModal";
import { createNote } from "links/createNote";

export default class OrbitPlugin extends Plugin {
	settings: OrbitSettings = DEFAULT_SETTINGS;

	/** Plugin-scoped link graph index — survives view open/close. */
	_index: LinkGraphIndex = new LinkGraphIndex(
		{ resolvedLinks: {}, unresolvedLinks: {} },
	);

	/** Debounced handler for active-leaf-change events (trailing). */
	_refreshDebouncer: Debouncer<[], void> | null = null;

	/** Guards single-build semantics for metadataCache 'resolved'. */
	private _indexBuilt = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this._index = new LinkGraphIndex(this.app.metadataCache);

		this.registerView(VIEW_TYPE, (leaf) => new OrbitView(
			leaf,
			undefined,
			this._buildRelationsDeps(),
			this._buildDanglingDeps(),
		));

		this.addCommand({
			id: "open",
			name: "Open",
			callback: () => this.activateView(),
		});

		this.addSettingTab(new SettingsTab(this.app, this));

		this._wireEvents();

		console.debug(`${this.manifest.name} loaded (v${this.manifest.version})`);
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
	 * isExcluded: path → boolean
	 *   Resolves the path to a TFile via vault (for tag exclusion); falls back to
	 *   path-only exclusion for unresolved paths. A fresh ExclusionMatcher is
	 *   constructed per-call so settings changes propagate without restart.
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
			isExcluded: (path: string): boolean => {
				const s = this.settings;
				const matcher = new ExclusionMatcher(s.excludePathPatterns, s.excludeTagPatterns);
				const abstract = this.app.vault.getAbstractFileByPath(path);
				if (abstract instanceof TFile) {
					return matcher.isExcluded(abstract, this.app.metadataCache);
				}
				// Unresolved path — path-only exclusion (no TFile to check tags against)
				return matcher.isPathExcluded(path);
			},
			onManage: (target: string): void => {
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
				for (const leaf of leaves) {
					const view = leaf.view;
					if (view instanceof OrbitView) {
						view.pendingManageTarget = target;
						void view.setState(
							{ ...view.getState(), activeTab: "dangling" },
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
			app: this.app,
			service: new LinkRewriteService(
				this.app.vault,
				this.app.fileManager,
				this.app.metadataCache as unknown as McArg,
				this._index,
				this.app.workspace,
			),
			// Cast: real App constructors are supersets of DanglingPanelApp —
			// runtime-compatible but not nominally assignable.
			ConfirmRewriteModal: ConfirmRewriteModal as unknown as DanglingDeps["ConfirmRewriteModal"],
			folderPicker: NotePickerModal as unknown as DanglingDeps["folderPicker"],
			notePicker: NoteFilePicker as unknown as DanglingDeps["notePicker"],
			createNote,
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
		this.registerEvent(
			this.app.vault.on("rename", (file: { path: string }, oldPath: string) => {
				this._index.renameFile(oldPath, file.path);
				this._repaintActivePanel();
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file: { path: string }) => {
				this._index.removeFile(file.path);
				this._repaintActivePanel();
			}),
		);
	}

	private _wireMetadataCacheEvents(): void {
		// Register 'changed' eagerly (not inside onLayoutReady) so it fires
		// for all cache updates from the start.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file: { path: string }) => {
				this._index.updateFile(file.path);
				this._repaintActivePanel();
			}),
		);

		// Register 'resolved' inside onLayoutReady so we build once after layout
		// is ready (cache is fully populated at that point).
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.metadataCache.on("resolved", () => {
					if (!this._indexBuilt) {
						this._index.buildFull();
						this._indexBuilt = true;
					}
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
