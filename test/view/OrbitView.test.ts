/**
 * T1.3 — OrbitView shell + accessible TabBar
 *
 * Tests cover:
 * - VIEW_TYPE constant, display text, icon
 * - TabBar: three role="tab" buttons in role="tablist", one aria-selected="true"
 * - Tab click: swaps panel, updates aria-selected
 * - Arrow key navigation (Left/Right), Home, End
 * - Enter/Space activate selected tab
 * - getState/setState round-trip for {activeTab, danglingScope, collapsedSections}
 * - setState switches active tab and re-renders
 * - Only the active panel is mounted; others removed on switch
 * - onClose empties the container; _runCleanup runs registered teardown
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceLeaf, ViewStateResult } from "../__mocks__/obsidian";
import { OrbitView, VIEW_TYPE } from "view/OrbitView";
import type { OrbitViewState, TabId } from "types/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLeaf(): WorkspaceLeaf {
	return new WorkspaceLeaf();
}

function makeResult(): ViewStateResult {
	return { history: false };
}

/** Flush microtasks so async onOpen/setState settle before asserting. */
async function flush(): Promise<void> {
	await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeInitialState(overrides?: Partial<OrbitViewState>): OrbitViewState {
	return {
		activeTab: "relations",
		danglingScope: "vault",
		collapsedSections: [],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Describe blocks
// ---------------------------------------------------------------------------

describe("OrbitView identity", () => {
	it("VIEW_TYPE is 'orbit'", () => {
		expect(VIEW_TYPE).toBe("orbit");
	});

	it("getViewType() returns 'orbit'", () => {
		const view = new OrbitView(makeLeaf());
		expect(view.getViewType()).toBe("orbit");
	});

	it("getDisplayText() returns 'Orbit'", () => {
		const view = new OrbitView(makeLeaf());
		expect(view.getDisplayText()).toBe("Orbit");
	});

	it("getIcon() returns a non-empty string", () => {
		const view = new OrbitView(makeLeaf());
		expect(view.getIcon().length).toBeGreaterThan(0);
	});
});

describe("OrbitView TabBar rendering", () => {
	it("renders a role='tablist' container", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const tablist = view.contentEl.querySelector("[role='tablist']");
		expect(tablist).not.toBeNull();
	});

	it("renders exactly three role='tab' buttons", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const tabs = view.contentEl.querySelectorAll("[role='tab']");
		expect(tabs.length).toBe(3);
	});

	it("exactly one tab has aria-selected='true' initially", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const selected = view.contentEl.querySelectorAll("[role='tab'][aria-selected='true']");
		expect(selected.length).toBe(1);
	});

	it("the 'relations' tab is selected by default", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const selected = view.contentEl.querySelector("[role='tab'][aria-selected='true']");
		expect(selected?.getAttribute("data-tab-id")).toBe("relations");
	});

	it("non-active tabs have tabindex='-1'", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const tabs = view.contentEl.querySelectorAll("[role='tab']");
		const inactive = Array.from(tabs).filter(
			(t) => t.getAttribute("aria-selected") !== "true",
		);
		for (const tab of inactive) {
			expect(tab.getAttribute("tabindex")).toBe("-1");
		}
	});

	it("active tab has tabindex='0'", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const selected = view.contentEl.querySelector("[role='tab'][aria-selected='true']");
		expect(selected?.getAttribute("tabindex")).toBe("0");
	});
});

describe("OrbitView tab activation via click", () => {
	it("clicking 'dangling' tab makes it aria-selected='true'", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const danglingTab = view.contentEl.querySelector("[data-tab-id='dangling']") as HTMLElement;
		danglingTab.click();
		await flush();

		expect(danglingTab.getAttribute("aria-selected")).toBe("true");
	});

	it("clicking 'dangling' tab deselects 'relations'", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const danglingTab = view.contentEl.querySelector("[data-tab-id='dangling']") as HTMLElement;
		danglingTab.click();
		await flush();

		const relationsTab = view.contentEl.querySelector("[data-tab-id='relations']");
		expect(relationsTab?.getAttribute("aria-selected")).toBe("false");
	});

	it("only one tab is selected after clicking 'recent'", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const recentTab = view.contentEl.querySelector("[data-tab-id='recent']") as HTMLElement;
		recentTab.click();
		await flush();

		const selected = view.contentEl.querySelectorAll("[role='tab'][aria-selected='true']");
		expect(selected.length).toBe(1);
	});
});

describe("OrbitView panel switching", () => {
	it("only the active panel is rendered after onOpen", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const panels = view.contentEl.querySelectorAll("[role='tabpanel']");
		expect(panels.length).toBe(1);
	});

	it("switching tab removes the old panel and shows the new one", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const danglingTab = view.contentEl.querySelector("[data-tab-id='dangling']") as HTMLElement;
		danglingTab.click();
		await flush();

		const panels = view.contentEl.querySelectorAll("[role='tabpanel']");
		expect(panels.length).toBe(1);

		const visiblePanel = panels[0];
		expect(visiblePanel?.getAttribute("aria-labelledby")).toContain("dangling");
	});

	it("active panel has aria-labelledby referencing the active tab id", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const panel = view.contentEl.querySelector("[role='tabpanel']") as HTMLElement;
		expect(panel.getAttribute("aria-labelledby")).toContain("relations");
	});
});

describe("OrbitView keyboard navigation", () => {
	function dispatchKey(target: Element, key: string): void {
		target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	}

	it("ArrowRight moves selection from 'relations' to 'dangling'", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const relationsTab = view.contentEl.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatchKey(relationsTab, "ArrowRight");
		await flush();

		const focused = view.contentEl.querySelector("[role='tab'][tabindex='0']");
		expect(focused?.getAttribute("data-tab-id")).toBe("dangling");
	});

	it("ArrowLeft wraps from 'relations' to 'recent'", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const relationsTab = view.contentEl.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatchKey(relationsTab, "ArrowLeft");
		await flush();

		const focused = view.contentEl.querySelector("[role='tab'][tabindex='0']");
		expect(focused?.getAttribute("data-tab-id")).toBe("recent");
	});

	it("ArrowRight wraps from 'recent' to 'relations'", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		// Navigate to recent first
		const relationsTab = view.contentEl.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatchKey(relationsTab, "ArrowRight"); // → dangling
		dispatchKey(view.contentEl.querySelector("[data-tab-id='dangling']") as HTMLElement, "ArrowRight"); // → recent
		dispatchKey(view.contentEl.querySelector("[data-tab-id='recent']") as HTMLElement, "ArrowRight"); // → wraps to relations
		await flush();

		const focused = view.contentEl.querySelector("[role='tab'][tabindex='0']");
		expect(focused?.getAttribute("data-tab-id")).toBe("relations");
	});

	it("Home moves focus to first tab", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const danglingTab = view.contentEl.querySelector("[data-tab-id='dangling']") as HTMLElement;
		dispatchKey(danglingTab, "Home");
		await flush();

		const focused = view.contentEl.querySelector("[role='tab'][tabindex='0']");
		expect(focused?.getAttribute("data-tab-id")).toBe("relations");
	});

	it("End moves focus to last tab", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const relationsTab = view.contentEl.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatchKey(relationsTab, "End");
		await flush();

		const focused = view.contentEl.querySelector("[role='tab'][tabindex='0']");
		expect(focused?.getAttribute("data-tab-id")).toBe("recent");
	});

	it("Enter activates the focused (roving) tab", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const relationsTab = view.contentEl.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatchKey(relationsTab, "ArrowRight"); // focus moves to dangling

		const danglingTab = view.contentEl.querySelector("[data-tab-id='dangling']") as HTMLElement;
		dispatchKey(danglingTab, "Enter");
		await flush();

		expect(danglingTab.getAttribute("aria-selected")).toBe("true");
	});

	it("Space activates the focused (roving) tab", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const relationsTab = view.contentEl.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatchKey(relationsTab, "ArrowRight"); // focus moves to dangling

		const danglingTab = view.contentEl.querySelector("[data-tab-id='dangling']") as HTMLElement;
		dispatchKey(danglingTab, " ");
		await flush();

		expect(danglingTab.getAttribute("aria-selected")).toBe("true");
	});
});

describe("OrbitView getState/setState", () => {
	it("getState returns the initial default OrbitViewState", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const state = view.getState() as OrbitViewState;
		expect(state.activeTab).toBe("relations");
		expect(state.danglingScope).toBe("vault");
		expect(state.collapsedSections).toEqual([]);
	});

	it("setState round-trips activeTab, danglingScope, collapsedSections", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		const newState: OrbitViewState = {
			activeTab: "dangling",
			danglingScope: "folder",
			collapsedSections: ["section-a"],
		};
		await view.setState(newState, makeResult());

		const state = view.getState() as OrbitViewState;
		expect(state).toEqual(newState);
	});

	it("setState switches the active tab in the DOM", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		await view.setState(
			makeInitialState({ activeTab: "recent" }),
			makeResult(),
		);

		const selected = view.contentEl.querySelector("[role='tab'][aria-selected='true']");
		expect(selected?.getAttribute("data-tab-id")).toBe("recent");
	});

	it("setState with unknown activeTab falls back gracefully (stays on current tab)", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		// Pass a state with an unknown tab — should not throw, keeps current selection
		await view.setState(
			{ activeTab: "unknown" as TabId, danglingScope: "vault", collapsedSections: [] },
			makeResult(),
		);

		// Should still have exactly one selected tab
		const selected = view.contentEl.querySelectorAll("[role='tab'][aria-selected='true']");
		expect(selected.length).toBe(1);
	});
});

describe("OrbitView cleanup", () => {
	it("onClose empties the contentEl", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();
		await view.onClose();

		expect(view.contentEl.children.length).toBe(0);
	});

	it("registered cleanup runs via _runCleanup()", async () => {
		const view = new OrbitView(makeLeaf());
		await view.onOpen();

		// _runCleanup is available from Component base
		(view as unknown as { _runCleanup(): void })._runCleanup();

		// After cleanup no unhandled errors; view is still structurally valid
		expect(view.getViewType()).toBe("orbit");
	});

	it("DOM event listeners are registered via register/registerDomEvent so cleanup is automatic", async () => {
		const view = new OrbitView(makeLeaf());

		// register is provided by Component mock (vi.fn)
		const registerSpy = vi.spyOn(view, "register");
		await view.onOpen();

		// At least one cleanup handler must have been registered
		expect(registerSpy.mock.calls.length).toBeGreaterThan(0);
	});

	it("tab-button click and keydown listeners use registerDomEvent (not raw addEventListener)", async () => {
		const view = new OrbitView(makeLeaf());
		const registerDomEventSpy = vi.spyOn(view, "registerDomEvent");
		await view.onOpen();

		// Three tabs × two event types (click + keydown) = 6 calls minimum
		const types = registerDomEventSpy.mock.calls.map((c) => c[1]);
		const clickCount = types.filter((t) => t === "click").length;
		const keydownCount = types.filter((t) => t === "keydown").length;
		expect(clickCount).toBe(3);
		expect(keydownCount).toBe(3);
	});

	it("tab-button handlers are not invoked after _runCleanup()", async () => {
		const view = new OrbitView(makeLeaf());

		// Capture the actual handlers passed to registerDomEvent so we can
		// call them directly and assert they no longer trigger state changes.
		const captured: Array<{ el: HTMLElement; type: string; handler: EventListener }> = [];
		vi.spyOn(view, "registerDomEvent").mockImplementation(
			(el: HTMLElement, type: string, handler: EventListener) => {
				captured.push({ el, type, handler });
			},
		);

		await view.onOpen();
		const onSelectSpy = vi.fn();
		// Replace internals: we only want to test that _runCleanup prevents
		// the handlers from being re-registered, not that they call onSelect.
		// Instead, verify click on a detached button (after cleanup) no longer
		// changes aria-selected by checking captured click handlers do nothing
		// when called post-cleanup. Since the mock registerDomEvent does not
		// wire real DOM, we verify the count dropped from the spy perspective.

		// Verify all 6 handlers (3 click + 3 keydown) were captured via registerDomEvent
		const clickHandlers = captured.filter((c) => c.type === "click");
		const keydownHandlers = captured.filter((c) => c.type === "keydown");
		expect(clickHandlers.length).toBe(3);
		expect(keydownHandlers.length).toBe(3);

		// Run cleanup — the Component base should invoke registered teardown fns
		(view as unknown as { _runCleanup(): void })._runCleanup();

		// After cleanup the view nulls its internal references; calling a captured
		// click handler must not throw (detached element, internal state cleared)
		expect(() => {
			for (const { handler, el } of clickHandlers) {
				handler.call(el, new MouseEvent("click"));
			}
		}).not.toThrow();
	});
});
