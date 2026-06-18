/**
 * OrbitView — the main three-tab sidebar view for the Orbit plugin.
 *
 * Extends Obsidian's ItemView and hosts the TabBar + a single active panel
 * at a time. Panel render functions are injected via a registry keyed by
 * TabId, keeping this module decoupled from Relations/Dangling/Recent logic.
 *
 * State persistence: getState/setState (ephemeral per-leaf, not saveData).
 * Cleanup: DOM listeners use this.registerDomEvent (delegated to TabBar);
 * internal refs are cleared via this.register.
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import type { ViewStateResult } from "obsidian";
import type { OrbitViewState, TabId } from "types/index";
import { TabBar, TAB_DEFINITIONS } from "view/TabBar";

export const VIEW_TYPE = "orbit";

const VALID_TABS: ReadonlySet<string> = new Set(
	TAB_DEFINITIONS.map((t) => t.id),
);

/** Minimal type for a panel renderer — receives the container to render into. */
export type PanelRenderer = (container: HTMLElement) => void;

const DEFAULT_PANEL_RENDERERS: Record<TabId, PanelRenderer> = {
	relations: (el) => {
		el.createDiv({ cls: "orbit-panel-placeholder", text: "Relations" });
	},
	dangling: (el) => {
		el.createDiv({ cls: "orbit-panel-placeholder", text: "Dangling links" });
	},
	recent: (el) => {
		el.createDiv({ cls: "orbit-panel-placeholder", text: "Recent files" });
	},
};

export class OrbitView extends ItemView {
	private state: OrbitViewState = {
		activeTab: "relations",
		danglingScope: "vault",
		collapsedSections: [],
	};

	private tabBar: TabBar | null = null;
	private panelContainer: HTMLElement | null = null;
	private readonly panelRenderers: Record<TabId, PanelRenderer>;

	constructor(
		leaf: WorkspaceLeaf,
		panelRenderers?: Partial<Record<TabId, PanelRenderer>>,
	) {
		super(leaf);
		this.panelRenderers = {
			...DEFAULT_PANEL_RENDERERS,
			...panelRenderers,
		};
	}

	// -------------------------------------------------------------------------
	// ItemView identity
	// -------------------------------------------------------------------------

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Orbit";
	}

	getIcon(): string {
		return "git-fork";
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
				this.renderPanel(tabId);
			},
			registerDomEvent: (el, type, handler) => {
				this.registerDomEvent(el, type, handler);
			},
		});

		this.panelContainer = this.contentEl.createDiv({ cls: "orbit-panel-container" });
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
			collapsedSections: this.state.collapsedSections,
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);

		const incoming = state as Partial<OrbitViewState>;
		const newTab = incoming.activeTab;
		const resolvedTab: TabId = (newTab && VALID_TABS.has(newTab))
			? newTab
			: this.state.activeTab;

		this.state = {
			activeTab: resolvedTab,
			danglingScope: incoming.danglingScope ?? this.state.danglingScope,
			collapsedSections: incoming.collapsedSections ?? this.state.collapsedSections,
		};

		// Update TabBar and panel to reflect new state
		if (this.tabBar) {
			this.tabBar.setActiveTab(resolvedTab);
			this.renderPanel(resolvedTab);
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
	// Private — panel rendering
	// -------------------------------------------------------------------------

	private renderPanel(tabId: TabId): void {
		if (!this.panelContainer) return;

		// Remove existing panel(s)
		this.panelContainer.empty();

		// Build the new panel
		const panelEl = this.panelContainer.createEl("div", {
			attr: {
				role: "tabpanel",
				"aria-labelledby": `orbit-tab-${tabId}`,
				id: `orbit-tab-panel-${tabId}`,
			},
		});

		const renderer = this.panelRenderers[tabId];
		renderer(panelEl);
	}
}
