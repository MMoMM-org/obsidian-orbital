/**
 * T1.4 — SettingsTab: renders controls for all OrbitSettings fields,
 * persists on change.
 *
 * Tests cover:
 * - All OrbitSettings fields have a visible Setting control rendered
 * - Each numeric field (recentListLength, secondHopCap, refreshDebounceMs)
 *   persists its value on change and calls saveSettings
 * - Boolean toggles (secondHopEnabled, showCounts) persist on change
 * - Dropdown fields (danglingDefaultScope, danglingGrouping, defaultTab)
 *   persist on change
 * - Text fields (newNoteFolder) persist on change
 * - Textarea-style fields (excludePathPatterns, excludeTagPatterns) split on
 *   newlines and persist arrays on change
 * - Section headings exist for grouping
 */

import { describe, it, expect, vi } from "vitest";
import { App, Plugin } from "../__mocks__/obsidian";
import { DEFAULT_SETTINGS } from "types/index";
import { SettingsTab } from "settings/SettingsTab";
import type OrbitPlugin from "main";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePlugin(): OrbitPlugin {
	const app = new App();
	const plugin = new Plugin(app) as unknown as OrbitPlugin;
	plugin.settings = { ...DEFAULT_SETTINGS };
	plugin.saveSettings = vi.fn(async () => {});
	return plugin;
}

function makeTab(plugin: OrbitPlugin): SettingsTab {
	const app = new App();
	return new SettingsTab(app, plugin);
}

function renderTab(tab: SettingsTab): HTMLElement {
	// containerEl is already augmented by PluginSettingTab mock
	tab.display();
	return tab.containerEl;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSettingNames(container: HTMLElement): string[] {
	return Array.from(
		container.querySelectorAll("[data-setting-name]"),
	).map((el) => el.getAttribute("data-setting-name") ?? "");
}

function findInput(
	container: HTMLElement,
	settingName: string,
): HTMLInputElement | null {
	const settingEl = container.querySelector(
		`[data-setting-name="${settingName}"]`,
	);
	return settingEl?.querySelector("input") ?? null;
}

function findSelect(
	container: HTMLElement,
	settingName: string,
): HTMLSelectElement | null {
	const settingEl = container.querySelector(
		`[data-setting-name="${settingName}"]`,
	);
	return settingEl?.querySelector("select") ?? null;
}

function findToggle(
	container: HTMLElement,
	settingName: string,
): HTMLElement | null {
	const settingEl = container.querySelector(
		`[data-setting-name="${settingName}"]`,
	);
	return settingEl?.querySelector("[role='switch']") ?? null;
}

async function flush(): Promise<void> {
	await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsTab — field coverage", () => {
	it("renders a setting for recentListLength", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("recent"))).toBe(true);
	});

	it("renders a setting for excludePathPatterns", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("path"))).toBe(true);
	});

	it("renders a setting for excludeTagPatterns", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("tag"))).toBe(true);
	});

	it("renders a setting for secondHopEnabled", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("second"))).toBe(true);
	});

	it("renders a setting for secondHopCap", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		// "second" covers both secondHopEnabled and secondHopCap
		const secondMatches = names.filter((n) => n.toLowerCase().includes("second"));
		expect(secondMatches.length).toBeGreaterThanOrEqual(2);
	});

	it("renders a setting for refreshDebounceMs", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("debounce") || n.toLowerCase().includes("refresh"))).toBe(true);
	});

	it("renders a setting for danglingDefaultScope", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("scope") || n.toLowerCase().includes("dangling"))).toBe(true);
	});

	it("renders a setting for danglingGrouping", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("group"))).toBe(true);
	});

	it("renders a setting for newNoteFolder", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("folder"))).toBe(true);
	});

	it("renders a setting for defaultTab", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("tab"))).toBe(true);
	});

	it("renders a setting for showCounts", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const names = getSettingNames(container);
		expect(names.some((n) => n.toLowerCase().includes("count"))).toBe(true);
	});

	it("has at least one section heading", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);
		const headings = container.querySelectorAll(".setting-heading");
		expect(headings.length).toBeGreaterThan(0);
	});
});

describe("SettingsTab — numeric field persistence", () => {
	it("recentListLength: input change mutates settings and calls saveSettings", async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => el.getAttribute("data-setting-name")?.toLowerCase().includes("recent"));
		const input = settingEl?.querySelector("input") as HTMLInputElement | null;
		expect(input).not.toBeNull();

		input!.value = "42";
		input!.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();

		expect(plugin.settings.recentListLength).toBe(42);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("secondHopCap: input change mutates settings", async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => {
				const name = el.getAttribute("data-setting-name")?.toLowerCase() ?? "";
				return name.includes("second") && (name.includes("cap") || name.includes("limit") || name.includes("max"));
			});
		const input = settingEl?.querySelector("input") as HTMLInputElement | null;
		expect(input).not.toBeNull();

		input!.value = "25";
		input!.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();

		expect(plugin.settings.secondHopCap).toBe(25);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("refreshDebounceMs: input change mutates settings", async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => {
				const name = el.getAttribute("data-setting-name")?.toLowerCase() ?? "";
				return name.includes("debounce") || name.includes("refresh");
			});
		const input = settingEl?.querySelector("input") as HTMLInputElement | null;
		expect(input).not.toBeNull();

		input!.value = "500";
		input!.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();

		expect(plugin.settings.refreshDebounceMs).toBe(500);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

describe("SettingsTab — toggle persistence", () => {
	it("secondHopEnabled: toggle click mutates settings and calls saveSettings", async () => {
		const plugin = makePlugin();
		plugin.settings.secondHopEnabled = true;
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => {
				const name = el.getAttribute("data-setting-name")?.toLowerCase() ?? "";
				return name.includes("second") && !name.includes("cap") && !name.includes("limit") && !name.includes("max");
			});
		const toggle = settingEl?.querySelector("[role='switch']") as HTMLElement | null;
		expect(toggle).not.toBeNull();

		toggle!.click();
		await flush();

		expect(plugin.settings.secondHopEnabled).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("showCounts: toggle click mutates settings", async () => {
		const plugin = makePlugin();
		plugin.settings.showCounts = true;
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => el.getAttribute("data-setting-name")?.toLowerCase().includes("count"));
		const toggle = settingEl?.querySelector("[role='switch']") as HTMLElement | null;
		expect(toggle).not.toBeNull();

		toggle!.click();
		await flush();

		expect(plugin.settings.showCounts).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

describe("SettingsTab — dropdown persistence", () => {
	it("danglingDefaultScope: change event persists value", async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => {
				const name = el.getAttribute("data-setting-name")?.toLowerCase() ?? "";
				return name.includes("scope") || (name.includes("dangling") && name.includes("scope"));
			});
		const select = settingEl?.querySelector("select") as HTMLSelectElement | null;
		expect(select).not.toBeNull();

		select!.value = "folder";
		select!.dispatchEvent(new Event("change", { bubbles: true }));
		await flush();

		expect(plugin.settings.danglingDefaultScope).toBe("folder");
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("danglingGrouping: change event persists value", async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => el.getAttribute("data-setting-name")?.toLowerCase().includes("group"));
		const select = settingEl?.querySelector("select") as HTMLSelectElement | null;
		expect(select).not.toBeNull();

		select!.value = "source";
		select!.dispatchEvent(new Event("change", { bubbles: true }));
		await flush();

		expect(plugin.settings.danglingGrouping).toBe("source");
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("defaultTab: change event persists value", async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => el.getAttribute("data-setting-name")?.toLowerCase().includes("tab"));
		const select = settingEl?.querySelector("select") as HTMLSelectElement | null;
		expect(select).not.toBeNull();

		select!.value = "dangling";
		select!.dispatchEvent(new Event("change", { bubbles: true }));
		await flush();

		expect(plugin.settings.defaultTab).toBe("dangling");
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

describe("SettingsTab — text field persistence", () => {
	it("newNoteFolder: input change persists value", async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => el.getAttribute("data-setting-name")?.toLowerCase().includes("folder"));
		const input = settingEl?.querySelector("input") as HTMLInputElement | null;
		expect(input).not.toBeNull();

		input!.value = "Notes/";
		input!.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();

		expect(plugin.settings.newNoteFolder).toBe("Notes/");
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

describe("SettingsTab — textarea pattern fields", () => {
	it("excludePathPatterns: change persists as string array split on newline", async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => el.getAttribute("data-setting-name")?.toLowerCase().includes("path"));
		const textarea = settingEl?.querySelector("textarea") as HTMLTextAreaElement | null;
		expect(textarea).not.toBeNull();

		textarea!.value = "templates/\ndaily/";
		textarea!.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();

		expect(plugin.settings.excludePathPatterns).toEqual(["templates/", "daily/"]);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("excludeTagPatterns: change persists as string array", async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const container = renderTab(tab);

		const settingEl = Array.from(container.querySelectorAll("[data-setting-name]"))
			.find((el) => el.getAttribute("data-setting-name")?.toLowerCase().includes("tag"));
		const textarea = settingEl?.querySelector("textarea") as HTMLTextAreaElement | null;
		expect(textarea).not.toBeNull();

		textarea!.value = "#daily\n#archive";
		textarea!.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();

		expect(plugin.settings.excludeTagPatterns).toEqual(["#daily", "#archive"]);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

describe("SettingsTab — display refresh", () => {
	it("calling display() again clears and re-renders the container", () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);

		tab.display();
		const firstCount = tab.containerEl.children.length;
		tab.display();
		// Should not accumulate elements (containerEl.empty() was called)
		expect(tab.containerEl.children.length).toBe(firstCount);
	});
});
