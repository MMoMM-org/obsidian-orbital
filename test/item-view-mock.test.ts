/**
 * T1.0 smoke tests:
 * 1. ItemView can be subclassed and instantiated from the obsidian mock.
 * 2. Path aliases (src as baseUrl) resolve in tests — e.g. `types/index`.
 */

import { describe, expect, it } from "vitest";
import { ItemView, ViewStateResult, WorkspaceLeaf } from "./__mocks__/obsidian";
import { DEFAULT_SETTINGS } from "types/index";

// --- ItemView subclass smoke test ---

class TestView extends ItemView {
	getViewType(): string {
		return "test-view";
	}

	getDisplayText(): string {
		return "Test View";
	}
}

describe("ItemView mock", () => {
	it("can be subclassed and instantiated", () => {
		const leaf = new WorkspaceLeaf();
		const view = new TestView(leaf);
		expect(view).toBeInstanceOf(ItemView);
	});

	it("getViewType returns the subclass value", () => {
		const leaf = new WorkspaceLeaf();
		const view = new TestView(leaf);
		expect(view.getViewType()).toBe("test-view");
	});

	it("getDisplayText returns the subclass value", () => {
		const leaf = new WorkspaceLeaf();
		const view = new TestView(leaf);
		expect(view.getDisplayText()).toBe("Test View");
	});

	it("exposes a containerEl HTMLElement", () => {
		const leaf = new WorkspaceLeaf();
		const view = new TestView(leaf);
		expect(view.containerEl).toBeInstanceOf(HTMLElement);
	});

	it("exposes a contentEl HTMLElement nested inside containerEl", () => {
		const leaf = new WorkspaceLeaf();
		const view = new TestView(leaf);
		expect(view.contentEl).toBeInstanceOf(HTMLElement);
		expect(view.containerEl.contains(view.contentEl)).toBe(true);
	});

	it("getIcon returns empty string by default", () => {
		const leaf = new WorkspaceLeaf();
		const view = new TestView(leaf);
		expect(view.getIcon()).toBe("");
	});

	it("getState returns an empty object by default", () => {
		const leaf = new WorkspaceLeaf();
		const view = new TestView(leaf);
		expect(view.getState()).toEqual({});
	});

	it("setState resolves with the correct async signature", async () => {
		const leaf = new WorkspaceLeaf();
		const view = new TestView(leaf);
		const result: ViewStateResult = { history: false };
		await expect(view.setState({ tab: "notes" }, result)).resolves.toBeUndefined();
	});

	it("onOpen and onClose can be called without throwing", async () => {
		const leaf = new WorkspaceLeaf();
		const view = new TestView(leaf);
		await expect(view.onOpen()).resolves.toBeUndefined();
		await expect(view.onClose()).resolves.toBeUndefined();
	});
});

// --- Path alias smoke test ---

describe("path alias (types/index)", () => {
	it("resolves DEFAULT_SETTINGS via alias", () => {
		expect(DEFAULT_SETTINGS).toBeDefined();
		expect(DEFAULT_SETTINGS.defaultTab).toBe("relations");
	});
});
