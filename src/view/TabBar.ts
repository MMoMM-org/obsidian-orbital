/**
 * TabBar — accessible, vanilla-DOM tab switcher.
 *
 * Renders a role="tablist" container with three role="tab" buttons.
 * Implements roving tabindex: the focused tab has tabindex=0, others -1.
 * Arrow Left/Right cycle selection (with wrap-around); Home/End jump to ends.
 * Enter/Space activate the currently focused tab.
 *
 * The host (OrbitView) injects an onSelect callback that drives panel switching
 * and state persistence. TabBar owns only the DOM and keyboard logic.
 */

import type { TabId } from "types/index";

export interface TabDefinition {
	id: TabId;
	label: string;
}

export const TAB_DEFINITIONS: TabDefinition[] = [
	{ id: "relations", label: "Relations" },
	{ id: "dangling", label: "Dangling links" },
	{ id: "recent", label: "Recent files" },
];

export interface TabBarOptions {
	/** Called when a tab is activated (clicked or Enter/Space). */
	onSelect: (tabId: TabId) => void;
	/** Initial active tab. Defaults to 'relations'. */
	initialTab?: TabId;
	/** DOM id prefix for tab buttons — used by aria-controls. */
	idPrefix?: string;
	/**
	 * DOM event registration delegate. Supply `this.registerDomEvent` from
	 * the owning ItemView/Component so that tab-button listeners are tracked
	 * in Obsidian's cleanup chain and torn down on view unload.
	 * Falls back to raw addEventListener when omitted (e.g. in unit tests
	 * that don't need lifecycle tracking).
	 */
	registerDomEvent?: <K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (ev: HTMLElementEventMap[K]) => void,
	) => void;
}

/**
 * TabBar manages the tablist DOM subtree.
 * Created by passing the parent container; appends the tablist on construction.
 */
export class TabBar {
	private readonly buttons: Map<TabId, HTMLElement> = new Map();
	private focusedTabId: TabId;
	private readonly onSelect: (tabId: TabId) => void;
	private readonly idPrefix: string;
	private readonly addListener: <K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (ev: HTMLElementEventMap[K]) => void,
	) => void;

	constructor(
		private readonly container: HTMLElement,
		options: TabBarOptions,
	) {
		this.onSelect = options.onSelect;
		this.idPrefix = options.idPrefix ?? "orbit-tab";
		this.focusedTabId = options.initialTab ?? "relations";
		this.addListener = options.registerDomEvent ?? ((el, type, handler) => {
			el.addEventListener(type, handler);
		});

		this.buildTablist();
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/** Set the active tab, updating aria-selected and roving tabindex. */
	setActiveTab(tabId: TabId): void {
		const validTab = TAB_DEFINITIONS.find((t) => t.id === tabId);
		if (!validTab) return;

		this.focusedTabId = tabId;
		this.updateButtonStates(tabId);
	}

	// -------------------------------------------------------------------------
	// Private — DOM construction
	// -------------------------------------------------------------------------

	private buildTablist(): void {
		// Use Obsidian-augmented createEl for popout-window-safe element creation.
		const tablist = (this.container as unknown as AugmentedEl).createEl("div", {
			attr: {
				role: "tablist",
				class: "orbit-tab-bar nav-buttons-container",
			},
		});

		for (const def of TAB_DEFINITIONS) {
			this.buildTabButton(tablist, def);
		}

		this.updateButtonStates(this.focusedTabId);
	}

	private buildTabButton(tablist: HTMLElement, def: TabDefinition): void {
		const btn = (tablist as unknown as AugmentedEl).createEl("button", {
			attr: {
				role: "tab",
				"data-tab-id": def.id,
				id: `${this.idPrefix}-${def.id}`,
				"aria-controls": `${this.idPrefix}-panel-${def.id}`,
			},
		});
		btn.textContent = def.label;

		this.buttons.set(def.id, btn);

		this.addListener(btn, "click", () => {
			this.activateTab(def.id);
		});

		this.addListener(btn, "keydown", (e) => {
			this.handleKeydown(e, def.id);
		});
	}

	// -------------------------------------------------------------------------
	// Private — state transitions
	// -------------------------------------------------------------------------

	private activateTab(tabId: TabId): void {
		this.focusedTabId = tabId;
		this.updateButtonStates(tabId);
		this.onSelect(tabId);
	}

	private updateButtonStates(activeId: TabId): void {
		for (const [id, btn] of this.buttons) {
			const isActive = id === activeId;
			btn.setAttribute("aria-selected", String(isActive));
			btn.setAttribute("tabindex", isActive ? "0" : "-1");
			if (isActive) {
				btn.classList.add("is-active");
			} else {
				btn.classList.remove("is-active");
			}
		}
	}

	private moveFocus(fromId: TabId, delta: number): void {
		const ids = TAB_DEFINITIONS.map((t) => t.id);
		const currentIndex = ids.indexOf(fromId);
		if (currentIndex === -1) return;

		const nextIndex = (currentIndex + delta + ids.length) % ids.length;
		const nextId = ids[nextIndex];
		if (!nextId) return;

		this.focusedTabId = nextId;
		this.updateButtonStates(nextId);
		// Move DOM focus so keyboard users see the cursor in the right place.
		// The tab is not activated until Enter/Space.
		this.buttons.get(nextId)?.focus();
	}

	// -------------------------------------------------------------------------
	// Private — keyboard handling
	// -------------------------------------------------------------------------

	private handleKeydown(e: KeyboardEvent, fromId: TabId): void {
		switch (e.key) {
			case "ArrowRight":
				e.preventDefault();
				this.moveFocus(fromId, 1);
				break;
			case "ArrowLeft":
				e.preventDefault();
				this.moveFocus(fromId, -1);
				break;
			case "Home":
				e.preventDefault();
				this.moveFocusToIndex(0);
				break;
			case "End":
				e.preventDefault();
				this.moveFocusToIndex(TAB_DEFINITIONS.length - 1);
				break;
			case "Enter":
			case " ":
				e.preventDefault();
				this.activateTab(this.focusedTabId);
				break;
		}
	}

	private moveFocusToIndex(index: number): void {
		const def = TAB_DEFINITIONS[index];
		if (!def) return;
		this.focusedTabId = def.id;
		this.updateButtonStates(def.id);
		this.buttons.get(def.id)?.focus();
	}
}

// ---------------------------------------------------------------------------
// Internal type for Obsidian-augmented elements
// ---------------------------------------------------------------------------

/** Minimal shape for Obsidian's augmented HTMLElement (createEl helper).
 *  Declared as a standalone interface (not extending HTMLElement) to avoid
 *  conflicting overload signatures in lib.dom.d.ts. Cast sites use
 *  `el as unknown as AugmentedEl`. */
interface AugmentedEl {
	createEl(
		tag: string,
		opts?: {
			text?: string;
			cls?: string;
			attr?: Record<string, string>;
		},
	): HTMLElement;
	textContent: string | null;
	classList: DOMTokenList;
	setAttribute(name: string, value: string): void;
	appendChild(node: Node): Node;
	addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
	focus(): void;
}
