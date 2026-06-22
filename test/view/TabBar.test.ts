/**
 * TabBar unit tests — T5.2
 *
 * Coverage:
 * - role=tablist / role=tab ARIA attributes (already exercised in OrbitView.test.ts,
 *   repeated here to make TabBar independently testable)
 * - roving tabindex: active tab has 0, others -1
 * - Arrow Left/Right cycle; Home / End jump to extremes
 * - Enter/Space activate focused tab and call onSelect
 * - is-narrow class toggle when tab bar container is narrower than threshold (Gap C)
 * - setActiveTab reflects aria-selected + is-active class
 */

import { describe, it, expect, vi } from "vitest";
import { augmentEl } from "../__mocks__/obsidian";
import { TabBar } from "view/TabBar";
import type { TabBarOptions } from "view/TabBar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

function makeTabBar(container: HTMLElement, overrides: Partial<TabBarOptions> = {}): TabBar {
	return new TabBar(container, {
		onSelect: vi.fn(),
		...overrides,
	});
}

// ---------------------------------------------------------------------------
// Basic ARIA structure
// ---------------------------------------------------------------------------

describe("TabBar ARIA structure", () => {
	it("renders a role=tablist container", () => {
		const el = makeContainer();
		makeTabBar(el);

		const tablist = el.querySelector("[role='tablist']");
		expect(tablist).not.toBeNull();
	});

	it("renders exactly three role=tab buttons", () => {
		const el = makeContainer();
		makeTabBar(el);

		const tabs = el.querySelectorAll("[role='tab']");
		expect(tabs.length).toBe(3);
	});

	it("initially the 'relations' tab is aria-selected=true", () => {
		const el = makeContainer();
		makeTabBar(el, { initialTab: "relations" });

		const selected = el.querySelector("[role='tab'][aria-selected='true']");
		expect(selected?.getAttribute("data-tab-id")).toBe("relations");
	});

	it("non-active tabs have tabindex=-1", () => {
		const el = makeContainer();
		makeTabBar(el, { initialTab: "relations" });

		const tabs = el.querySelectorAll("[role='tab']");
		const inactive = Array.from(tabs).filter((t) => t.getAttribute("aria-selected") !== "true");
		for (const tab of inactive) {
			expect(tab.getAttribute("tabindex")).toBe("-1");
		}
	});

	it("active tab has tabindex=0", () => {
		const el = makeContainer();
		makeTabBar(el, { initialTab: "dangling" });

		const selected = el.querySelector("[role='tab'][aria-selected='true']");
		expect(selected?.getAttribute("tabindex")).toBe("0");
	});
});

// ---------------------------------------------------------------------------
// setActiveTab
// ---------------------------------------------------------------------------

describe("TabBar setActiveTab", () => {
	it("setActiveTab('dangling') marks dangling as aria-selected=true", () => {
		const el = makeContainer();
		const bar = makeTabBar(el);

		bar.setActiveTab("dangling");

		const selected = el.querySelector("[role='tab'][aria-selected='true']");
		expect(selected?.getAttribute("data-tab-id")).toBe("dangling");
	});

	it("setActiveTab with unknown id is a no-op", () => {
		const el = makeContainer();
		const bar = makeTabBar(el, { initialTab: "relations" });

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		bar.setActiveTab("nonexistent" as any);

		// Still one selected tab — the original one
		const selected = el.querySelectorAll("[role='tab'][aria-selected='true']");
		expect(selected.length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Click activation
// ---------------------------------------------------------------------------

describe("TabBar click activation", () => {
	it("clicking a tab calls onSelect with its id", () => {
		const onSelect = vi.fn();
		const el = makeContainer();
		makeTabBar(el, { onSelect });

		const danglingTab = el.querySelector("[data-tab-id='dangling']") as HTMLElement;
		danglingTab.click();

		expect(onSelect).toHaveBeenCalledWith("dangling");
	});

	it("clicking a tab makes it aria-selected=true", () => {
		const el = makeContainer();
		makeTabBar(el);

		const recentTab = el.querySelector("[data-tab-id='recent']") as HTMLElement;
		recentTab.click();

		expect(recentTab.getAttribute("aria-selected")).toBe("true");
	});
});

// ---------------------------------------------------------------------------
// Keyboard navigation (Arrow/Home/End/Enter/Space)
// ---------------------------------------------------------------------------

describe("TabBar keyboard navigation", () => {
	function dispatch(target: Element, key: string): void {
		target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	}

	it("ArrowRight from 'relations' moves tabindex=0 to 'dangling' without activating", () => {
		const onSelect = vi.fn();
		const el = makeContainer();
		makeTabBar(el, { onSelect, initialTab: "relations" });

		const relationsTab = el.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatch(relationsTab, "ArrowRight");

		const focusedTab = el.querySelector("[role='tab'][tabindex='0']");
		expect(focusedTab?.getAttribute("data-tab-id")).toBe("dangling");
		// Arrow alone does not call onSelect
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("ArrowLeft wraps from 'relations' to 'recent'", () => {
		const el = makeContainer();
		makeTabBar(el, { initialTab: "relations" });

		const relationsTab = el.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatch(relationsTab, "ArrowLeft");

		const focusedTab = el.querySelector("[role='tab'][tabindex='0']");
		expect(focusedTab?.getAttribute("data-tab-id")).toBe("recent");
	});

	it("Home moves focus to first tab ('relations')", () => {
		const el = makeContainer();
		makeTabBar(el, { initialTab: "recent" });

		const recentTab = el.querySelector("[data-tab-id='recent']") as HTMLElement;
		dispatch(recentTab, "Home");

		const focusedTab = el.querySelector("[role='tab'][tabindex='0']");
		expect(focusedTab?.getAttribute("data-tab-id")).toBe("relations");
	});

	it("End moves focus to last tab ('recent')", () => {
		const el = makeContainer();
		makeTabBar(el, { initialTab: "relations" });

		const relationsTab = el.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatch(relationsTab, "End");

		const focusedTab = el.querySelector("[role='tab'][tabindex='0']");
		expect(focusedTab?.getAttribute("data-tab-id")).toBe("recent");
	});

	it("Enter activates the focused tab and calls onSelect", () => {
		const onSelect = vi.fn();
		const el = makeContainer();
		makeTabBar(el, { onSelect, initialTab: "relations" });

		// Move focus to dangling via ArrowRight
		const relationsTab = el.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatch(relationsTab, "ArrowRight");

		// Now press Enter on the dangling tab (it has focus / tabindex=0)
		const danglingTab = el.querySelector("[data-tab-id='dangling']") as HTMLElement;
		dispatch(danglingTab, "Enter");

		expect(onSelect).toHaveBeenCalledWith("dangling");
		expect(danglingTab.getAttribute("aria-selected")).toBe("true");
	});

	it("Space activates the focused tab and calls onSelect", () => {
		const onSelect = vi.fn();
		const el = makeContainer();
		makeTabBar(el, { onSelect, initialTab: "relations" });

		const relationsTab = el.querySelector("[data-tab-id='relations']") as HTMLElement;
		dispatch(relationsTab, "ArrowRight");

		const danglingTab = el.querySelector("[data-tab-id='dangling']") as HTMLElement;
		dispatch(danglingTab, " ");

		expect(onSelect).toHaveBeenCalledWith("dangling");
	});
});

// ---------------------------------------------------------------------------
// Gap C — is-narrow class toggle (tab labels collapse to icons on narrow widths)
// ---------------------------------------------------------------------------

describe("TabBar is-narrow class toggle (Gap C)", () => {
	it("setNarrow(true) adds is-narrow class to the tablist element", () => {
		const el = makeContainer();
		const bar = makeTabBar(el);

		bar.setNarrow(true);

		const tablist = el.querySelector("[role='tablist']");
		expect(tablist?.classList.contains("is-narrow")).toBe(true);
	});

	it("setNarrow(false) removes is-narrow class from the tablist element", () => {
		const el = makeContainer();
		const bar = makeTabBar(el);

		bar.setNarrow(true);
		bar.setNarrow(false);

		const tablist = el.querySelector("[role='tablist']");
		expect(tablist?.classList.contains("is-narrow")).toBe(false);
	});

	it("setNarrow is a no-op when the class is already in the expected state", () => {
		const el = makeContainer();
		const bar = makeTabBar(el);

		// Start not-narrow; set to false (no change) — must not throw
		expect(() => bar.setNarrow(false)).not.toThrow();
		// Start not-narrow; set to true twice — must not throw
		expect(() => {
			bar.setNarrow(true);
			bar.setNarrow(true);
		}).not.toThrow();
	});

	it("each tab button contains a .orbit-tab-label child span with the label text", () => {
		const el = makeContainer();
		makeTabBar(el);

		const tabs = el.querySelectorAll("[role='tab']");
		for (const tab of Array.from(tabs)) {
			const labelSpan = tab.querySelector(".orbit-tab-label");
			expect(labelSpan).not.toBeNull();
			expect(labelSpan?.textContent?.length).toBeGreaterThan(0);
		}
	});

	it("with is-narrow applied the .orbit-tab-label child span is present in the DOM (CSS hides it)", () => {
		const el = makeContainer();
		const bar = makeTabBar(el);
		bar.setNarrow(true);

		const tablist = el.querySelector("[role='tablist']");
		expect(tablist?.classList.contains("is-narrow")).toBe(true);

		// The span must exist in the DOM — CSS display:none is what hides it
		const labelSpans = el.querySelectorAll(".orbit-tab-label");
		expect(labelSpans.length).toBe(3);
	});
});
