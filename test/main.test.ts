/**
 * T1.4 — main.ts lifecycle: view/command registration, activateView, cleanup
 *
 * Tests cover:
 * - onload: registers VIEW_TYPE via registerView without throwing
 * - onload: registers an 'open-orbit' command via addCommand
 * - onload: adds the settings tab via addSettingTab
 * - activateView: reveals existing leaf when one already exists (no duplicate)
 * - activateView: creates a right leaf when none exists
 * - activateView: only one leaf revealed per call (leaf-reuse)
 * - onunload: does NOT call workspace.detachLeavesOfType
 * - onExternalSettingsChange: re-reads settings from disk (calls loadData again)
 */

import { describe, it, expect, vi } from "vitest";
import { App, WorkspaceLeaf } from "./__mocks__/obsidian";
import { VIEW_TYPE } from "view/OrbitView";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

async function makePlugin(app: App) {
	// Dynamically import so each test gets a fresh module evaluation.
	// We construct OrbitPlugin directly against the mock App.
	const { default: OrbitPlugin } = await import("main");
	// OrbitPlugin constructor takes (app, manifest) from Obsidian Plugin base;
	// the mock Plugin constructor accepts an optional App.
	// We cast to access internals needed by tests.
	const plugin = new OrbitPlugin(app as unknown as Parameters<typeof OrbitPlugin>[0]);
	return plugin;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function flush(): Promise<void> {
	await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OrbitPlugin onload — view registration", () => {
	it("registers VIEW_TYPE without throwing", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();

		expect(app.workspace.getLeavesOfType).toBeDefined();
		// registerView should have been called with VIEW_TYPE
		expect(plugin.registerView).toHaveBeenCalledWith(
			VIEW_TYPE,
			expect.any(Function),
		);
	});

	it("registerView factory creates an OrbitView instance", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();

		const factory = vi.mocked(plugin.registerView).mock.calls[0]?.[1];
		expect(factory).toBeDefined();

		const leaf = new WorkspaceLeaf();
		const { OrbitView } = await import("view/OrbitView");
		const view = (factory as (leaf: WorkspaceLeaf) => unknown)(leaf);
		expect(view).toBeInstanceOf(OrbitView);
	});

	it("dangling tab renders real DanglingPanel (not placeholder) when view created via plugin factory", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();

		const factory = vi.mocked(plugin.registerView).mock.calls[0]?.[1];
		const leaf = new WorkspaceLeaf();
		const { OrbitView } = await import("view/OrbitView");
		const view = (factory as unknown as (leaf: WorkspaceLeaf) => unknown)(leaf) as InstanceType<typeof OrbitView>;

		await view.onOpen();

		// Navigate to dangling tab
		const danglingTab = view.contentEl.querySelector("[data-tab-id='dangling']") as HTMLElement;
		danglingTab.click();
		await new Promise<void>((r) => setTimeout(r, 0));

		// Should render real DanglingPanel (empty state) — not the placeholder
		const placeholder = view.contentEl.querySelector(".orbit-panel-placeholder");
		expect(placeholder).toBeNull();

		const emptyState = view.contentEl.querySelector(".orbit-dangling-empty");
		expect(emptyState).not.toBeNull();
	});

	it("recent tab renders real RecentPanel empty state (not placeholder) when view created via plugin factory", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();

		const factory = vi.mocked(plugin.registerView).mock.calls[0]?.[1];
		const leaf = new WorkspaceLeaf();
		const { OrbitView } = await import("view/OrbitView");
		const view = (factory as unknown as (leaf: WorkspaceLeaf) => unknown)(leaf) as InstanceType<typeof OrbitView>;

		await view.onOpen();

		// Navigate to recent tab
		const recentTab = view.contentEl.querySelector("[data-tab-id='recent']") as HTMLElement;
		recentTab.click();
		await new Promise<void>((r) => setTimeout(r, 0));

		// Should render real RecentPanel (empty state) — not the placeholder
		const placeholder = view.contentEl.querySelector(".orbit-panel-placeholder");
		expect(placeholder).toBeNull();

		const emptyState = view.contentEl.querySelector(".orbit-recent-empty");
		expect(emptyState).not.toBeNull();
		expect(emptyState?.textContent).toBe("No recent files yet.");
	});
});

describe("OrbitPlugin onload — command registration", () => {
	it("registers an 'open' command", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();

		const calls = vi.mocked(plugin.addCommand).mock.calls;
		const orbitCmd = calls.find((c) => c[0]?.id === "open");
		expect(orbitCmd).toBeDefined();
	});

	it("the command has a non-empty name", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();

		const calls = vi.mocked(plugin.addCommand).mock.calls;
		const cmd = calls.find((c) => c[0]?.id === "open")?.[0];
		expect(cmd?.name).toBeTruthy();
	});
});

describe("OrbitPlugin onload — settings tab", () => {
	it("adds a settings tab", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();

		expect(plugin.addSettingTab).toHaveBeenCalledOnce();
	});
});

describe("OrbitPlugin activateView — leaf reuse", () => {
	it("activates the existing leaf when one is already open", async () => {
		const app = makeApp();
		const existingLeaf = new WorkspaceLeaf();
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([existingLeaf]);

		const plugin = await makePlugin(app);
		await plugin.onload();

		// Trigger via the command callback
		const calls = vi.mocked(plugin.addCommand).mock.calls;
		const cmd = calls.find((c) => c[0]?.id === "open")?.[0];
		await (cmd?.callback as () => Promise<void>)?.();
		await flush();

		// Should activate the existing leaf, not create a new one
		expect(app.workspace.setActiveLeaf).toHaveBeenCalledWith(existingLeaf, { focus: true });
		expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
	});

	it("creates a right leaf when none exists", async () => {
		const app = makeApp();
		// No existing leaves
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([]);
		const newLeaf = new WorkspaceLeaf();
		vi.mocked(app.workspace.getRightLeaf).mockReturnValue(newLeaf);

		const plugin = await makePlugin(app);
		await plugin.onload();

		const calls = vi.mocked(plugin.addCommand).mock.calls;
		const cmd = calls.find((c) => c[0]?.id === "open")?.[0];
		await (cmd?.callback as () => Promise<void>)?.();
		await flush();

		expect(app.workspace.getRightLeaf).toHaveBeenCalledWith(false);
		expect(newLeaf.setViewState).toHaveBeenCalledWith({
			type: VIEW_TYPE,
			active: true,
		});
		expect(app.workspace.setActiveLeaf).toHaveBeenCalledWith(newLeaf, { focus: true });
	});

	it("does nothing when getRightLeaf returns null (null-leaf guard)", async () => {
		const app = makeApp();
		// No existing leaves, and getRightLeaf returns null
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([]);
		vi.mocked(app.workspace.getRightLeaf).mockReturnValue(null as unknown as ReturnType<typeof app.workspace.getRightLeaf>);

		const plugin = await makePlugin(app);
		await plugin.onload();

		const calls = vi.mocked(plugin.addCommand).mock.calls;
		const cmd = calls.find((c) => c[0]?.id === "open")?.[0];

		// Should not throw, and setViewState must not be called
		await expect(
			(cmd?.callback as () => Promise<void>)?.(),
		).resolves.toBeUndefined();
		await flush();

		// No leaf was available, so setViewState could not have been called
		// (only assertable via getRightLeaf returning null — no leaf to call it on)
		expect(app.workspace.setActiveLeaf).not.toHaveBeenCalled();
	});

	it("does not open a second leaf when one already exists", async () => {
		const app = makeApp();
		const existingLeaf = new WorkspaceLeaf();
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([existingLeaf]);

		const plugin = await makePlugin(app);
		await plugin.onload();

		const calls = vi.mocked(plugin.addCommand).mock.calls;
		const cmd = calls.find((c) => c[0]?.id === "open")?.[0];
		const cb = cmd?.callback as () => Promise<void>;
		await cb?.();
		await cb?.();
		await flush();

		// setActiveLeaf called twice (for each invocation) but always the same leaf
		expect(app.workspace.setActiveLeaf).toHaveBeenCalledTimes(2);
		expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
	});
});

describe("OrbitPlugin onunload — leaf preservation", () => {
	it("does not detach leaves on unload", async () => {
		const app = makeApp();
		const detachSpy = vi.fn();
		(app.workspace as unknown as Record<string, unknown>)["detachLeavesOfType"] = detachSpy;

		const plugin = await makePlugin(app);
		await plugin.onload();
		plugin.onunload();

		expect(detachSpy).not.toHaveBeenCalled();
	});
});

describe("OrbitPlugin onExternalSettingsChange", () => {
	it("re-reads settings from disk when external settings change", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();

		// Reset loadData call count after initial load
		vi.mocked(plugin.loadData).mockClear();

		// Simulate Obsidian calling onExternalSettingsChange
		await plugin.onExternalSettingsChange?.();

		// loadData should be called again to re-read settings
		expect(plugin.loadData).toHaveBeenCalledOnce();
	});

	it("settings reflect the newly loaded values after external change", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();

		// Simulate a changed setting coming from disk
		vi.mocked(plugin.loadData).mockResolvedValueOnce({
			recentListLength: 99,
		});

		await plugin.onExternalSettingsChange?.();

		expect(plugin.settings.recentListLength).toBe(99);
	});
});

// ---------------------------------------------------------------------------
// T5.1 integration: "Manage →" → Dangling filtered deep-link
// ---------------------------------------------------------------------------

describe("T5.1 integration: Relations Manage → switches to Dangling tab filtered to target", () => {
	/**
	 * Build a plugin + OrbitView wired together so onManage can find the view
	 * via getLeavesOfType. Unresolved links are pre-loaded in the mock metadata
	 * cache so both RelationsPanel and DanglingPanel see real data.
	 *
	 * Important: the view has its own mock App instance (ItemView creates one).
	 * We patch view.app.workspace.getActiveFile to simulate an active file, and
	 * plugin.app.metadataCache.unresolvedLinks so relations + dangling data loads.
	 */
	async function buildWiredView(unresolvedLinks: Record<string, Record<string, number>>) {
		const app = makeApp();
		// Unresolved links for the plugin's index and metadataCache
		app.metadataCache.unresolvedLinks = unresolvedLinks;

		const plugin = await makePlugin(app);
		await plugin.onload();

		// Build the view via the registered factory
		const factory = vi.mocked(plugin.registerView).mock.calls[0]?.[1] as
			| ((leaf: WorkspaceLeaf) => unknown)
			| undefined;
		if (!factory) throw new Error("registerView factory not captured");

		const { OrbitView } = await import("view/OrbitView");
		const leaf = new WorkspaceLeaf();
		const view = factory(leaf) as InstanceType<typeof OrbitView>;

		// Wire the leaf so onManage (via getLeavesOfType) can find the view.
		// The mock WorkspaceLeaf.view is a plain object; we replace it with the real OrbitView.
		(leaf as unknown as { view: unknown }).view = view;
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([leaf] as WorkspaceLeaf[]);

		// Build the full index from the unresolved links
		plugin._index.buildFull();

		await view.onOpen();
		return { plugin, app, view, leaf };
	}

	/**
	 * Set up an active file on both apps (plugin's and view's) so RelationsPanel
	 * renders the Missing section and DanglingPanel resolves the folder path.
	 */
	function setActiveFile(
		app: App,
		view: { app: App },
		path: string,
	): void {
		const mockFile = { path, basename: path.split("/").pop()?.replace(/\.md$/, "") ?? path, extension: "md", parent: null };
		const asFile = mockFile as ReturnType<typeof app.workspace.getActiveFile>;
		vi.mocked(app.workspace.getActiveFile).mockReturnValue(asFile);
		vi.mocked(view.app.workspace.getActiveFile).mockReturnValue(asFile);
	}

	it("clicking 'Manage →' on a Missing item switches the active tab to Dangling", async () => {
		// Source file "notes/source.md" references missing targets "TargetA" and "TargetB"
		const { app, view } = await buildWiredView({
			"notes/source.md": { "TargetA": 1, "TargetB": 1 },
		});

		setActiveFile(app, view, "notes/source.md");

		// Re-render the current (relations) tab to pick up the active file
		view.refreshActivePanel();
		await new Promise<void>((r) => setTimeout(r, 10));

		// Find and click the "Manage →" button for TargetA
		const manageBtn = view.contentEl.querySelector("[aria-label='Manage missing link']") as HTMLElement;
		expect(manageBtn).not.toBeNull();
		manageBtn.click();
		await new Promise<void>((r) => setTimeout(r, 10));

		// The dangling tab should now be active
		const activeTab = view.contentEl.querySelector("[role='tab'][aria-selected='true']");
		expect(activeTab?.getAttribute("data-tab-id")).toBe("dangling");
	});

	it("clicking 'Manage →' filters Dangling list to only the target's group", async () => {
		const { app, view } = await buildWiredView({
			"notes/source.md": { "TargetA": 1, "TargetB": 1 },
		});

		setActiveFile(app, view, "notes/source.md");
		view.refreshActivePanel();
		await new Promise<void>((r) => setTimeout(r, 10));

		const manageBtn = view.contentEl.querySelector("[aria-label='Manage missing link']") as HTMLElement;
		expect(manageBtn).not.toBeNull();
		manageBtn.click();
		await new Promise<void>((r) => setTimeout(r, 10));

		// Only the managed target group should be visible; the other should not
		const targetARow = view.contentEl.querySelector(".orbit-dangling-group[data-target='TargetA']");
		const targetBRow = view.contentEl.querySelector(".orbit-dangling-group[data-target='TargetB']");
		expect(targetARow).not.toBeNull();
		expect(targetBRow).toBeNull();
	});

	it("clicking 'Show all' in Dangling tab restores the full list", async () => {
		const { app, view } = await buildWiredView({
			"notes/source.md": { "TargetA": 1, "TargetB": 1 },
		});

		setActiveFile(app, view, "notes/source.md");
		view.refreshActivePanel();
		await new Promise<void>((r) => setTimeout(r, 10));

		// Click Manage → to activate filter
		const manageBtn = view.contentEl.querySelector("[aria-label='Manage missing link']") as HTMLElement;
		expect(manageBtn).not.toBeNull();
		manageBtn.click();
		await new Promise<void>((r) => setTimeout(r, 10));

		// Filter is active — click "Show all"
		const showAllBtn = view.contentEl.querySelector("[data-action='clear-filter']") as HTMLElement;
		expect(showAllBtn).not.toBeNull();
		showAllBtn.click();
		await new Promise<void>((r) => setTimeout(r, 10));

		// Both targets should now be visible
		const targetARow = view.contentEl.querySelector(".orbit-dangling-group[data-target='TargetA']");
		const targetBRow = view.contentEl.querySelector(".orbit-dangling-group[data-target='TargetB']");
		expect(targetARow).not.toBeNull();
		expect(targetBRow).not.toBeNull();
	});

	it("filter state persists across re-renders until cleared", async () => {
		const { app, view } = await buildWiredView({
			"notes/source.md": { "TargetA": 1, "TargetB": 1 },
		});

		setActiveFile(app, view, "notes/source.md");
		view.refreshActivePanel();
		await new Promise<void>((r) => setTimeout(r, 10));

		// Click Manage → to activate filter
		const manageBtn = view.contentEl.querySelector("[aria-label='Manage missing link']") as HTMLElement;
		expect(manageBtn).not.toBeNull();
		manageBtn.click();
		await new Promise<void>((r) => setTimeout(r, 10));

		// Simulate a re-render by calling refreshActivePanel (e.g. vault change)
		view.refreshActivePanel();
		await new Promise<void>((r) => setTimeout(r, 10));

		// Filter should still be active (TargetB not visible)
		const targetBRow = view.contentEl.querySelector(".orbit-dangling-group[data-target='TargetB']");
		expect(targetBRow).toBeNull();

		// And "Show all" is still visible
		const showAllBtn = view.contentEl.querySelector("[data-action='clear-filter']");
		expect(showAllBtn).not.toBeNull();
	});
});
