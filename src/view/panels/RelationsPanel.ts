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

import { Keymap, setIcon } from "obsidian";
import { computeRelations } from "graph/relations";
import type { RelationsMetadataCache } from "graph/relations";
import type { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { UnlinkedMentionGroup, UnlinkedMentionItem } from "graph/unlinkedMentions";
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

/**
 * Async unlinked-mentions provider (MentionLinkService subset).
 * `peek` is a synchronous look at the memoized result so the panel can render
 * cached rows without re-triggering a scan; `computeGroups` runs (or returns the
 * in-flight) scan; `linkMentions` converts mentions to wikilinks.
 */
export interface RelationsMentionsDep {
	peek(activePath: string): UnlinkedMentionGroup[] | null;
	computeGroups(activePath: string): Promise<UnlinkedMentionGroup[]>;
	linkMentions(activePath: string, sourcePath: string, offsets?: number[]): Promise<number>;
}

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
	/** Async provider for the "Unlinked mentions" section. */
	mentions: RelationsMentionsDep;
	/** Re-render the whole panel (used after an async scan resolves or a link op). */
	requestRefresh: () => void;
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
	{ key: "unlinkedMentions", label: "Unlinked mentions" },
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

		if (settings.unlinkedMentionsEnabled) {
			this.renderUnlinkedSection(container, activePath, collapsed, settings);
		}

		this.renderSection(container, "missing", result.missing.length, collapsed,
			(children) => {
				for (const item of result.missing) {
					this.renderMissingItem(children, item);
				}
			},
		);
	}

	// -------------------------------------------------------------------------
	// Private — unlinked mentions section (async / lazy)
	// -------------------------------------------------------------------------

	/**
	 * Render the "Unlinked mentions" section. Unlike the metadata-driven
	 * sections this one is async: it scans note contents on demand.
	 *
	 * - Collapsed (the default) → no scan is performed.
	 * - Expanded with a cached result → rows render synchronously from the memo.
	 * - Expanded without a cached result → a "Scanning…" placeholder renders and
	 *   the scan is kicked; when it resolves, `requestRefresh` re-renders and the
	 *   now-cached result is shown. The service de-dupes concurrent scans, so the
	 *   loop terminates after one round-trip.
	 */
	private renderUnlinkedSection(
		container: HTMLElement,
		activePath: string,
		collapsed: string[],
		settings: OrbitSettings,
	): void {
		const key = "unlinkedMentions";
		const isCollapsed = collapsed.includes(key);
		const cached = this.deps.mentions.peek(activePath);

		const section = (container as unknown as AugmentedEl).createEl("div", {
			cls: `orbit-relations-section${isCollapsed ? " is-collapsed" : ""}`,
			attr: { "data-section": key },
		});

		const header = (section as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-section-header tree-item-self is-clickable",
		});
		const label = SECTIONS.find((s) => s.key === key)?.label ?? key;
		(header as unknown as AugmentedEl).createSpan({ cls: "orbit-relations-section-label", text: label });

		if (settings.showCounts && cached !== null) {
			const total = cached.reduce((sum, g) => sum + g.matches.length, 0);
			(header as unknown as AugmentedEl).createSpan({
				cls: "orbit-relations-count",
				text: String(total),
			});
		}

		const children = (section as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-section-children tree-item-children",
		});

		if (!isCollapsed) {
			if (cached === null) {
				(children as unknown as AugmentedEl).createEl("div", {
					cls: "orbit-relations-mention-loading",
					text: "Scanning…",
				});
				void this.deps.mentions
					.computeGroups(activePath)
					.then(() => this.deps.requestRefresh());
			} else if (cached.length === 0) {
				(children as unknown as AugmentedEl).createEl("div", {
					cls: "orbit-relations-empty",
					text: "No unlinked mentions.",
				});
			} else {
				this.renderItemsWithCap(
					children,
					cached,
					(group) => this.renderMentionGroup(children, group, activePath, settings),
				);
			}
		}

		this.deps.registerDomEvent(header, "click", () => {
			this.toggleCollapsed(key);
			this.deps.requestRefresh();
		});
	}

	/**
	 * Render one source-note group using Obsidian's native search-result / tree-item
	 * class names so it inherits the exact look of the core Backlinks pane (collapse
	 * chevron, snippet cards, matched-text highlight). Orbit-prefixed classes are kept
	 * alongside as stable hooks for styling/tests.
	 */
	private renderMentionGroup(
		container: HTMLElement,
		group: UnlinkedMentionGroup,
		activePath: string,
		settings: OrbitSettings,
	): void {
		const groupEl = (container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-mention-group tree-item search-result",
		});

		const headerEl = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-mention-group-header tree-item-self search-result-file-title is-clickable",
		});

		const caret = (headerEl as unknown as AugmentedEl).createDiv({
			cls: "orbit-relations-mention-caret tree-item-icon collapse-icon",
		});
		setIcon(caret, "right-triangle");

		const nameEl = (headerEl as unknown as AugmentedEl).createDiv({
			cls: "orbit-relations-mention-name tree-item-inner",
			text: group.display,
		});

		// Right-aligned action cluster: badge, Link-all button, count flair.
		const actions = (headerEl as unknown as AugmentedEl).createDiv({
			cls: "orbit-relations-mention-actions",
		});

		if (group.alreadyLinks) {
			(actions as unknown as AugmentedEl).createEl("span", {
				cls: "orbit-relations-mention-linked-badge",
				text: "🔗",
				attr: { "aria-label": "Already links to the active note" },
			});
		}

		const linkAllBtn = (actions as unknown as AugmentedEl).createEl("button", {
			cls: "orbit-relations-mention-link-btn",
			text: "Link all",
			attr: { "aria-label": "Link all mentions in this note" },
		});

		if (settings.showCounts) {
			const flairOuter = (actions as unknown as AugmentedEl).createDiv({
				cls: "tree-item-flair-outer",
			});
			(flairOuter as unknown as AugmentedEl).createSpan({
				cls: "orbit-relations-count tree-item-flair",
				text: String(group.matches.length),
			});
		}

		const snippetsEl = (groupEl as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-mention-snippets search-result-file-matches",
		});
		for (const item of group.matches) {
			this.renderMentionSnippet(snippetsEl, group, item, activePath, settings);
		}

		// Clicking the title row toggles the matches (native behaviour); clicking the
		// note name opens it, and the action buttons handle their own clicks.
		this.deps.registerDomEvent(headerEl, "click", () => {
			groupEl.classList.toggle("is-collapsed");
		});

		this.deps.registerDomEvent(nameEl, "click", (evt) => {
			evt.stopPropagation();
			this.openMentionPath(group.path, activePath, evt, settings);
		});

		this.deps.registerDomEvent(nameEl, "mouseover", (evt) => {
			this.deps.app.workspace.trigger("hover-link", {
				event: evt,
				source: "orbit",
				hoverParent: this,
				targetEl: nameEl,
				linktext: group.path,
				sourcePath: activePath,
			});
		});

		this.deps.registerDomEvent(linkAllBtn, "click", (evt) => {
			evt.stopPropagation();
			void this.deps.mentions
				.linkMentions(activePath, group.path)
				.then(() => this.deps.requestRefresh());
		});
	}

	private renderMentionSnippet(
		container: HTMLElement,
		group: UnlinkedMentionGroup,
		item: UnlinkedMentionItem,
		activePath: string,
		settings: OrbitSettings,
	): void {
		const row = (container as unknown as AugmentedEl).createEl("div", {
			cls: "orbit-relations-mention-snippet search-result-file-match tappable",
		});

		const textWrap = (row as unknown as AugmentedEl).createSpan({
			cls: "orbit-relations-mention-snippet-text",
		});
		(textWrap as unknown as AugmentedEl).createSpan({ text: item.snippet.before });
		(textWrap as unknown as AugmentedEl).createSpan({
			cls: "orbit-relations-mention-highlight search-result-file-matched-text",
			text: item.snippet.hit,
		});
		(textWrap as unknown as AugmentedEl).createSpan({ text: item.snippet.after });

		const linkBtn = (row as unknown as AugmentedEl).createEl("button", {
			cls: "orbit-relations-mention-link-btn",
			text: "Link",
			attr: { "aria-label": "Link this mention" },
		});

		this.deps.registerDomEvent(row, "click", (evt) => {
			this.openMentionPath(group.path, activePath, evt, settings);
		});

		this.deps.registerDomEvent(linkBtn, "click", (evt) => {
			evt.stopPropagation();
			void this.deps.mentions
				.linkMentions(activePath, group.path, [item.start])
				.then(() => this.deps.requestRefresh());
		});
	}

	/**
	 * Open a mention's source note; new tab on Mod-click or per the setting.
	 *
	 * Use the "tab" PaneType (not boolean `true`) for the setting: passing a bare
	 * `true` to openLinkText throws inside Obsidian ("Cannot create property
	 * 'state' on boolean"). Keymap.isModEvent already yields a PaneType string on
	 * Mod-click, so we only need to substitute one for the setting-driven case.
	 */
	private openMentionPath(
		path: string,
		activePath: string,
		evt: MouseEvent,
		settings: OrbitSettings,
	): void {
		let newLeaf: boolean | string = Keymap.isModEvent(evt);
		if (newLeaf === false && settings.unlinkedOpenInNewTab) newLeaf = "tab";
		const leaf = this.deps.app.workspace.getLeaf(newLeaf);
		void leaf.openLinkText(path, activePath, newLeaf);
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
