/**
 * RelationsPanel — T2.3
 *
 * Renders four collapsible sections: Outgoing, Backlinks, 2nd-hop, Missing.
 * Consumes computeRelations() and exposes a clean, injectable deps interface
 * so unit tests can wire in mocks without an Obsidian runtime.
 *
 * Design decisions:
 * - Pure render: `render(container, activePath)` always rebuilds the subtree
 *   from scratch; callers re-invoke on vault changes (driven by OrbitView).
 * - No innerHTML: all nodes created via Obsidian's `createEl`/`createDiv`/
 *   `createSpan` helpers (augmented on HTMLElement in production and in tests).
 * - DOM listeners routed through the injected `registerDomEvent` delegate
 *   (same pattern as TabBar) for lifecycle-safe cleanup.
 * - `Keymap.isModEvent` imported from the `obsidian` barrel so production and
 *   tests both use the same import path (tests shadow it with the mock).
 */

import { Keymap } from "obsidian";
import { computeRelations } from "graph/relations";
import type { RelationsMetadataCache } from "graph/relations";
import type { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { OrbitSettings, RelationItem, MissingItem, SecondHopGroup } from "types/index";

// ---------------------------------------------------------------------------
// Structural app subset
// ---------------------------------------------------------------------------

export interface RelationsPanelApp {
	workspace: {
		getLeaf(newLeaf: boolean | string): {
			openLinkText(path: string, sourcePath: string, newLeaf: boolean | string): void | Promise<void>;
		};
		trigger(name: string, ...data: unknown[]): void;
	};
	metadataCache: RelationsMetadataCache;
}

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface RelationsPanelDeps {
	/** Pre-built link graph index. */
	index: LinkGraphIndex;
	/** Returns current plugin settings (called on each render). */
	getSettings: () => OrbitSettings;
	/**
	 * Structural Obsidian App subset — provides workspace + metadataCache.
	 * Production: pass the real `this.app`. Tests: pass a mock App instance.
	 */
	app: RelationsPanelApp;
	/** Returns true for paths that should be omitted from results. */
	isExcluded: (path: string) => boolean;
	/**
	 * Called when the user clicks 'Manage →' on a Missing row.
	 * Wired to tab-switch in T5.1; for now it is a plain callback.
	 */
	onManage: (target: string) => void;
	/** Returns the current set of collapsed section keys. */
	getCollapsed: () => string[];
	/** Persists the new collapsed section keys. */
	setCollapsed: (keys: string[]) => void;
	/**
	 * DOM event registration delegate — same pattern as TabBar.
	 * Route listeners through this so the owning Component tracks and
	 * tears them down on unload.
	 */
	registerDomEvent: <K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (ev: HTMLElementEventMap[K]) => void,
	) => void;
}

// ---------------------------------------------------------------------------
// Section metadata
// ---------------------------------------------------------------------------

const SECTIONS = [
	{ key: "outgoing", label: "Outgoing" },
	{ key: "backlinks", label: "Backlinks" },
	{ key: "secondHop", label: "2nd hop" },
	{ key: "missing", label: "Missing" },
] as const;

/**
 * Maximum number of items rendered per section before a "Show more" control appears.
 * Keeps the panel responsive on hub notes with hundreds of links (SDD §451).
 */
export const RENDER_CAP = 100;

type SectionKey = (typeof SECTIONS)[number]["key"];

// ---------------------------------------------------------------------------
// Augmented element helper — same cast pattern as TabBar
// ---------------------------------------------------------------------------

/**
 * Minimal shape for Obsidian's augmented HTMLElement helpers.
 * Declared as a standalone interface (not extending HTMLElement) to avoid
 * conflicting overload signatures in lib.dom.d.ts — identical pattern to TabBar.ts.
 * Cast sites use `el as unknown as AugmentedEl`.
 */
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
	classList: { toggle(cls: string, force?: boolean): void };
}

// ---------------------------------------------------------------------------
// RelationsPanel
// ---------------------------------------------------------------------------

export class RelationsPanel {
	private readonly deps: RelationsPanelDeps;

	constructor(deps: RelationsPanelDeps) {
		this.deps = deps;
	}

	/**
	 * (Re)render the panel into `container`.
	 * Always rebuilds from scratch — call whenever the active path changes.
	 */
	render(container: HTMLElement, activePath: string | null): void {
		(container as unknown as AugmentedEl).empty();

		if (!activePath) {
			this.renderEmptyState(container);
			return;
		}

		const settings = this.deps.getSettings();
		const result = computeRelations(
			this.deps.index,
			activePath,
			settings,
			this.deps.isExcluded,
			this.deps.app.metadataCache,
		);

		const collapsed = this.deps.getCollapsed();

		this.renderSection(container, "outgoing", result.outgoing.length, collapsed,
			(children) => {
				this.renderItemsWithCap(
					children,
					result.outgoing,
					(item) => this.renderResolvedItem(children, item, activePath, settings),
				);
			},
		);

		this.renderSection(container, "backlinks", result.backlinks.length, collapsed,
			(children) => {
				this.renderItemsWithCap(
					children,
					result.backlinks,
					(item) => this.renderResolvedItem(children, item, activePath, settings),
				);
			},
		);

		this.renderSection(
			container,
			"secondHop",
			this.countSecondHop(result.secondHop),
			collapsed,
			(children) => {
				for (const group of result.secondHop) {
					this.renderSecondHopGroup(children, group, activePath, settings);
				}
				if (result.truncated) {
					this.renderTruncationHint(children);
				}
			},
		);

		this.renderSection(container, "missing", result.missing.length, collapsed,
			(children) => {
				for (const item of result.missing) {
					this.renderMissingItem(children, item);
				}
			},
		);
	}

	// -------------------------------------------------------------------------
	// Private — section frame
	// -------------------------------------------------------------------------

	private renderSection(
		container: HTMLElement,
		key: SectionKey,
		count: number,
		collapsed: string[],
		renderChildren: (childrenEl: HTMLElement) => void,
	): void {
		const isCollapsed = collapsed.includes(key);
		const settings = this.deps.getSettings();

		const section = (container as unknown as AugmentedEl).createEl("div", {
			cls: `orbit-relations-section${isCollapsed ? " is-collapsed" : ""}`,
			attr: { "data-section": key },
		});

		const header = (section as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-section-header tree-item-self is-clickable",
		});

		const label = SECTIONS.find((s) => s.key === key)?.label ?? key;
		(header as unknown as AugmentedEl).createSpan({ cls: "orbit-relations-section-label", text: label });

		if (settings.showCounts) {
			(header as unknown as AugmentedEl).createSpan({
				cls: "orbit-relations-count",
				text: String(count),
			});
		}

		const children = (section as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-section-children tree-item-children",
		});

		renderChildren(children);

		this.deps.registerDomEvent(header, "click", () => {
			this.toggleCollapsed(key);
			section.classList.toggle("is-collapsed");
		});
	}

	// -------------------------------------------------------------------------
	// Private — item renderers
	// -------------------------------------------------------------------------

	private renderResolvedItem(
		container: HTMLElement,
		item: RelationItem,
		activePath: string,
		_settings: OrbitSettings,
	): void {
		const row = (container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-item tree-item nav-file-title is-clickable",
			attr: { "data-path": item.path },
		});
		(row as unknown as AugmentedEl).createSpan({ cls: "orbit-relations-item-label", text: item.display });

		this.deps.registerDomEvent(row, "click", (evt) => {
			const newLeaf = Keymap.isModEvent(evt);
			const leaf = this.deps.app.workspace.getLeaf(newLeaf);
			void leaf.openLinkText(item.path, activePath, newLeaf);
		});

		this.deps.registerDomEvent(row, "mouseover", (evt) => {
			this.deps.app.workspace.trigger("hover-link", {
				event: evt,
				source: "orbit",
				hoverParent: this,
				targetEl: row,
				linktext: item.path,
				sourcePath: activePath,
			});
		});
	}

	private renderSecondHopGroup(
		container: HTMLElement,
		group: SecondHopGroup,
		activePath: string,
		settings: OrbitSettings,
	): void {
		const groupEl = (container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-via-group",
		});
		(groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-via-label",
			text: group.via.display,
		});
		const itemsEl = (groupEl as unknown as AugmentedEl).createEl("div", { cls: "orbit-relations-via-items" });
		for (const item of group.items) {
			this.renderResolvedItem(itemsEl, item, activePath, settings);
		}
	}

	private renderMissingItem(container: HTMLElement, item: MissingItem): void {
		const row = (container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-missing-row",
		});
		(row as unknown as AugmentedEl).createSpan({
			cls: "orbit-relations-missing-target",
			text: item.target,
		});
		const btn = (row as unknown as AugmentedEl).createEl("button", {
			cls: "orbit-relations-manage-btn",
			attr: { "aria-label": "Manage missing link" },
		});
		btn.textContent = "Manage →";

		this.deps.registerDomEvent(btn, "click", () => {
			this.deps.onManage(item.target);
		});
	}

	private renderTruncationHint(container: HTMLElement): void {
		(container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-truncated",
			text: "Showing partial results — lower the 2nd-hop cap to see all.",
		});
	}

	/**
	 * Render items from `list` up to RENDER_CAP, then add a "Show more" control
	 * that renders the remaining items inline when clicked (Gap D / SDD §451).
	 */
	private renderItemsWithCap<T>(
		container: HTMLElement,
		list: T[],
		renderOne: (item: T) => void,
	): void {
		if (list.length <= RENDER_CAP) {
			for (const item of list) renderOne(item);
			return;
		}

		for (const item of list.slice(0, RENDER_CAP)) renderOne(item);

		const remaining = list.slice(RENDER_CAP);
		const showMoreBtn = (container as unknown as AugmentedEl).createEl("button", {
			cls: "orbit-show-more",
			text: `Show ${remaining.length} more…`,
		});

		this.deps.registerDomEvent(showMoreBtn, "click", () => {
			showMoreBtn.remove();
			for (const item of remaining) renderOne(item);
		});
	}

	private renderEmptyState(container: HTMLElement): void {
		(container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-empty",
			text: "No file open. Open a note to see its relations.",
		});
	}

	// -------------------------------------------------------------------------
	// Private — collapse helpers
	// -------------------------------------------------------------------------

	private toggleCollapsed(key: SectionKey): void {
		const current = this.deps.getCollapsed();
		const next = current.includes(key)
			? current.filter((k) => k !== key)
			: [...current, key];
		this.deps.setCollapsed(next);
	}

	private countSecondHop(groups: SecondHopGroup[]): number {
		return groups.reduce((sum, g) => sum + g.items.length, 0);
	}
}
