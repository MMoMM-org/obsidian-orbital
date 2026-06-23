/**
 * OrbitalView — the main three-tab sidebar view for the Orbital plugin.
 *
 * Extends Obsidian's ItemView and hosts the TabBar + a single active panel
 * at a time. Panel render functions are injected via a registry keyed by
 * TabId, keeping this module decoupled from Relations/Dangling/Recent logic.
 *
 * State persistence: getState/setState (ephemeral per-leaf, not saveData).
 * Cleanup: DOM listeners use this.registerDomEvent (delegated to TabBar);
 * internal refs are cleared via this.register.
 *
 * Relations wiring (T2.4):
 *   Pass `relationsDeps` to the constructor and OrbitalView will build the
 *   real RelationsPanel for the 'relations' tab, backed by the plugin's
 *   shared index and settings.
 *
 * Dangling wiring (T3.4b):
 *   Pass `danglingDeps` to the constructor and OrbitalView will build the
 *   real DanglingPanel for the 'dangling' tab, backed by the plugin's
 *   shared index, settings, and link-rewrite service.
 *
 * Cross-tab filter (T5.1):
 *   RelationsPanel calls onManage(target) → main.ts calls setState with
 *   { activeTab: "dangling", activeDanglingFilter: target }, which the
 *   DanglingPanel reads directly via getActiveFilter(). No separate
 *   pendingManageTarget field is needed.
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import type { ViewStateResult } from "obsidian";
import type { OrbitalViewState, TabId, DanglingGrouping } from "types/index";
import { TabBar, TAB_DEFINITIONS } from "view/TabBar";
import { RelationsPanel } from "view/panels/RelationsPanel";
import type { RelationsPanelDeps } from "view/panels/RelationsPanel";
import { DanglingPanel } from "view/panels/DanglingPanel";
import type { DanglingPanelDeps } from "view/panels/DanglingPanel";
import { RecentPanel } from "view/panels/RecentPanel";
import type { RecentPanelDeps } from "view/panels/RecentPanel";

export const VIEW_TYPE = "orbital";

const VALID_TABS: ReadonlySet<string> = new Set(
	TAB_DEFINITIONS.map((t) => t.id),
);

/**
 * Panel renderer — receives the container to render into and the path of the
 * currently active markdown file (null when no file is open).
 */
export type PanelRenderer = (container: HTMLElement, activePath: string | null) => void;

/**
 * Dependencies the plugin supplies for building the Relations panel.
 * Everything except `getCollapsed`, `setCollapsed`, and `registerDomEvent`
 * (those are owned by OrbitalView itself).
 */
export type RelationsDeps = Omit<RelationsPanelDeps, "getCollapsed" | "setCollapsed" | "registerDomEvent" | "requestRefresh">;

/**
 * Dependencies the plugin supplies for building the Dangling panel.
 * OrbitalView fills the view-owned deps: getGrouping/setGrouping, getScope/setScope,
 * getFolderPath, getActiveFilter/setActiveFilter/clearActiveFilter, and registerDomEvent.
 */
export type DanglingDeps = Omit<
	DanglingPanelDeps,
	| "getGrouping"
	| "setGrouping"
	| "getScope"
	| "setScope"
	| "getFolderPath"
	| "getActiveFilter"
	| "setActiveFilter"
	| "clearActiveFilter"
	| "getSearchQuery"
	| "setSearchQuery"
	| "registerDomEvent"
>;

/**
 * Dependencies the plugin supplies for building the Recent panel.
 * OrbitalView fills only `registerDomEvent` (view-lifecycle owned).
 */
export type RecentDeps = Omit<RecentPanelDeps, "registerDomEvent">;

const DEFAULT_PANEL_RENDERERS: Record<TabId, PanelRenderer> = {
	relations: (el) => {
		el.createDiv({ cls: "orbital-panel-placeholder", text: "Relations" });
	},
	dangling: (el) => {
		el.createDiv({ cls: "orbital-panel-placeholder", text: "Dangling links" });
	},
	recent: (el) => {
		el.createDiv({ cls: "orbital-panel-placeholder", text: "Recent notes" });
	},
};

export class OrbitalView extends ItemView {
	private state: OrbitalViewState = {
		activeTab: "relations",
		danglingScope: "vault",
		danglingGrouping: "target",
		// "unlinkedMentions" starts collapsed: its content is scanned lazily on
		// first expand (potentially an O(vault) read), so it must not auto-scan.
		collapsedSections: ["unlinkedMentions"],
		activeDanglingFilter: null,
		danglingSearchQuery: "",
	};

	private tabBar: TabBar | null = null;
	private panelContainer: HTMLElement | null = null;
	private readonly panelRenderers: Record<TabId, PanelRenderer>;

	constructor(
		leaf: WorkspaceLeaf,
		/**
		 * Optional panel renderers override (test seam and future tabs).
		 * If `relationsDeps` or `danglingDeps` is also supplied, the renderers
		 * built from deps take precedence over any matching key here.
		 */
		panelRenderers?: Partial<Record<TabId, PanelRenderer>>,
		/**
		 * When supplied, OrbitalView constructs the real RelationsPanel backed
		 * by the plugin's index + settings. When absent, the default placeholder
		 * is used (tests that don't need the real panel can omit this).
		 */
		relationsDeps?: RelationsDeps,
		/**
		 * When supplied, OrbitalView constructs the real DanglingPanel backed
		 * by the plugin's index, settings, and link-rewrite service.
		 * When absent, the default placeholder is used.
		 */
		danglingDeps?: DanglingDeps,
		/**
		 * When supplied, OrbitalView constructs the real RecentPanel backed
		 * by the plugin's shared RecentFilesStore and DragInsertHelper.
		 * When absent, the default placeholder is used.
		 */
		recentDeps?: RecentDeps,
	) {
		super(leaf);

		const merged: Record<TabId, PanelRenderer> = {
			...DEFAULT_PANEL_RENDERERS,
			...panelRenderers,
		};

		if (relationsDeps !== undefined) {
			merged.relations = this._buildRelationsRenderer(relationsDeps);
		}

		if (danglingDeps !== undefined) {
			const settings = danglingDeps.getSettings();
			this.state = {
				...this.state,
				danglingScope: settings.danglingDefaultScope,
				danglingGrouping: settings.danglingGrouping,
			};
			merged.dangling = this._buildDanglingRenderer(danglingDeps);
		}

		if (recentDeps !== undefined) {
			merged.recent = this._buildRecentRenderer(recentDeps);
		}

		this.panelRenderers = merged;
	}

	// -------------------------------------------------------------------------
	// ItemView identity
	// -------------------------------------------------------------------------

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Orbital";
	}

	getIcon(): string {
		return "orbit";
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	async onOpen(): Promise<void> {
		this.contentEl.empty();

		this.tabBar = new TabBar(this.contentEl, {
			initialTab: this.state.activeTab,
			onSelect: (tabId) => {
				this.state = { ...this.state, activeTab: tabId };
				this._switchingTab = true;
				this.renderPanel(tabId);
				this._switchingTab = false;
			},
			registerDomEvent: (el, type, handler) => {
				this.registerDomEvent(el, type, handler);
			},
		});

		this.panelContainer = this.contentEl.createDiv({ cls: "orbital-panel-container" });
		this.renderPanel(this.state.activeTab);

		// Register a cleanup function so _runCleanup() can be asserted in tests.
		this.register(() => {
			this.tabBar = null;
			this.panelContainer = null;
		});
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
		this.tabBar = null;
		this.panelContainer = null;
	}

	// -------------------------------------------------------------------------
	// State persistence (getState / setState)
	// -------------------------------------------------------------------------

	getState(): Record<string, unknown> {
		return {
			activeTab: this.state.activeTab,
			danglingScope: this.state.danglingScope,
			danglingGrouping: this.state.danglingGrouping,
			collapsedSections: this.state.collapsedSections,
			activeDanglingFilter: this.state.activeDanglingFilter,
			danglingSearchQuery: this.state.danglingSearchQuery,
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);

		const incoming = state as Partial<OrbitalViewState>;
		const newTab = incoming.activeTab;
		const resolvedTab: TabId = (newTab && VALID_TABS.has(newTab))
			? newTab
			: this.state.activeTab;

		// Capture previous tab before updating state so we know if a tab switch occurred.
		const prevTab = this.state.activeTab;

		this.state = {
			activeTab: resolvedTab,
			danglingScope: incoming.danglingScope ?? this.state.danglingScope,
			danglingGrouping: incoming.danglingGrouping ?? this.state.danglingGrouping,
			collapsedSections: incoming.collapsedSections ?? this.state.collapsedSections,
			activeDanglingFilter: incoming.activeDanglingFilter !== undefined
				? incoming.activeDanglingFilter
				: this.state.activeDanglingFilter,
			danglingSearchQuery: incoming.danglingSearchQuery ?? this.state.danglingSearchQuery,
		};

		// Update TabBar and panel to reflect new state.
		// Move focus into the new panel only when the tab actually changed.
		if (this.tabBar) {
			this.tabBar.setActiveTab(resolvedTab);
			this._switchingTab = resolvedTab !== prevTab;
			this.renderPanel(resolvedTab);
			this._switchingTab = false;
		}
	}

	// -------------------------------------------------------------------------
	// Public — refresh
	// -------------------------------------------------------------------------

	/**
	 * Re-render the currently active panel.
	 * Called by the plugin's debounced active-leaf-change handler and by
	 * the immediate post-'changed' repaint. No-op if the view is not open.
	 */
	refreshActivePanel(): void {
		if (this.panelContainer) {
			this.renderPanel(this.state.activeTab);
		}
	}

	// -------------------------------------------------------------------------
	// Private — relations panel factory
	// -------------------------------------------------------------------------

	/**
	 * Build the PanelRenderer closure for the 'relations' tab.
	 * Constructs a new RelationsPanel on each render call so the panel
	 * always reflects the latest deps state (settings, index) without
	 * stale closures.
	 */
	private _buildRelationsRenderer(deps: RelationsDeps): PanelRenderer {
		return (container: HTMLElement, activePath: string | null): void => {
			const panel = new RelationsPanel({
				...deps,
				getCollapsed: () => [...this.state.collapsedSections],
				setCollapsed: (keys: string[]) => {
					this.state = { ...this.state, collapsedSections: keys };
				},
				requestRefresh: () => this.refreshActivePanel(),
				registerDomEvent: (el, type, handler) => {
					this.registerDomEvent(el, type, handler);
				},
			});
			panel.render(container, activePath);
		};
	}

	// -------------------------------------------------------------------------
	// Private — dangling panel factory
	// -------------------------------------------------------------------------

	/**
	 * Build the PanelRenderer closure for the 'dangling' tab.
	 * Constructs a new DanglingPanel on each render call so the panel always
	 * reflects the latest deps state (settings, index) without stale closures.
	 * View-owned deps (grouping, scope, folderPath, activeFilter) are
	 * read from OrbitalView's own state at render time.
	 */
	private _buildDanglingRenderer(deps: DanglingDeps): PanelRenderer {
		// activePath is intentionally omitted: DanglingPanel resolves its own path via getFolderPath/getActiveFile.
		return (container: HTMLElement): void => {
			const panel = new DanglingPanel({
				...deps,
				getGrouping: (): DanglingGrouping => this.state.danglingGrouping,
				setGrouping: (g: DanglingGrouping): void => {
					this.state = { ...this.state, danglingGrouping: g };
					this.renderPanel("dangling");
				},
				getScope: () => this.state.danglingScope,
				setScope: (s) => {
					this.state = { ...this.state, danglingScope: s };
					this.renderPanel("dangling");
				},
				getFolderPath: () => this.app.workspace.getActiveFile()?.parent?.path ?? "",
				getActiveFilter: () => this.state.activeDanglingFilter,
				setActiveFilter: (target: string) => {
					this.state = { ...this.state, activeDanglingFilter: target };
				},
				clearActiveFilter: () => {
					this.state = { ...this.state, activeDanglingFilter: null };
					this.renderPanel("dangling");
				},
				getSearchQuery: () => this.state.danglingSearchQuery,
				setSearchQuery: (q: string) => {
					this.state = { ...this.state, danglingSearchQuery: q };
					this.renderPanel("dangling");
				},
				registerDomEvent: (el, type, handler) => {
					this.registerDomEvent(el, type, handler);
				},
			});
			panel.render(container);
		};
	}

	// -------------------------------------------------------------------------
	// Private — recent panel factory
	// -------------------------------------------------------------------------

	/**
	 * Build the PanelRenderer closure for the 'recent' tab.
	 * Constructs a new RecentPanel on each render call so the panel always
	 * reflects the latest store state without stale closures.
	 * activePath is intentionally omitted: RecentPanel resolves its own list via the store.
	 */
	private _buildRecentRenderer(deps: RecentDeps): PanelRenderer {
		return (container: HTMLElement): void => {
			const panel = new RecentPanel({
				...deps,
				registerDomEvent: (el, type, handler) => {
					this.registerDomEvent(el, type, handler);
				},
			});
			panel.render(container);
		};
	}

	// -------------------------------------------------------------------------
	// Private — panel rendering
	// -------------------------------------------------------------------------

	/** Whether the current renderPanel call is triggered by a tab switch (vs passive refresh). */
	private _switchingTab = false;

	private renderPanel(tabId: TabId): void {
		if (!this.panelContainer) return;

		// Remove existing panel(s)
		this.panelContainer.empty();

		// Build the new panel — tabindex=-1 makes it programmatically focusable (Gap A).
		const panelEl = this.panelContainer.createEl("div", {
			attr: {
				role: "tabpanel",
				"aria-labelledby": `orbital-tab-${tabId}`,
				id: `orbital-tab-panel-${tabId}`,
				tabindex: "-1",
			},
		});

		const activePath = this.app.workspace.getActiveFile()?.path ?? null;
		const renderer = this.panelRenderers[tabId];
		renderer(panelEl, activePath);

		// Move focus into the panel only on an explicit tab switch, not on passive refresh.
		if (this._switchingTab) {
			panelEl.focus();
		}
	}
}
