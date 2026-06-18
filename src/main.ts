import { Plugin, debounce } from "obsidian";
import type { Debouncer } from "obsidian";
import { SettingsTab } from "settings/SettingsTab";
import { DEFAULT_SETTINGS, type OrbitSettings } from "types/index";
import { OrbitView, VIEW_TYPE } from "view/OrbitView";
import { LinkGraphIndex } from "graph/LinkGraphIndex";

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

		this.registerView(VIEW_TYPE, (leaf) => new OrbitView(leaf));

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

		const debounced = debounce(refreshFn, this.settings.refreshDebounceMs, false);
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
