/**
 * T2.4 — Event wiring: debounced refresh, index lifecycle, cleanup
 *
 * Tests cover:
 * 1. First 'resolved' after onLayoutReady → index.buildFull called exactly once;
 *    a second 'resolved' does NOT call buildFull again.
 * 2. 'changed' for a file → index.updateFile(path) called synchronously (not debounced),
 *    and a repaint scheduled.
 * 3. vault 'rename' → index.renameFile(old, new); vault 'delete' → index.removeFile(path).
 *    Repaint scheduled after each.
 * 4. Three rapid active-leaf-change events within the debounce window → exactly ONE
 *    refresh after the window elapses (debounce coalescing).
 * 5. All registrations go through registerEvent/register and _runCleanup clears them;
 *    the debouncer is cancelled on unload.
 *
 * Uses vi.useFakeTimers() for debounce control.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App } from "./__mocks__/obsidian";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

/**
 * Re-import OrbitalPlugin fresh each time to avoid module-level singleton state.
 * Each test call gets an isolated plugin instance.
 */
async function makePlugin(app: App) {
	// Bypass Vite module cache with a cache-busting query param isn't straightforward,
	// so we keep a single static import and construct fresh instances.
	const { default: OrbitalPlugin } = await import("main");
	return new OrbitalPlugin(app as unknown as Parameters<typeof OrbitalPlugin>[0]);
}

// ---------------------------------------------------------------------------
// Helpers for inspecting registered event handlers
// ---------------------------------------------------------------------------

/**
 * Pull the handler registered for a given event from `app.workspace.on` or
 * `app.metadataCache.on` / `app.vault.on` spy calls.
 */
function getRegisteredHandler(
	onSpy: ReturnType<typeof vi.fn>,
	event: string,
): ((...args: unknown[]) => void) | undefined {
	const call = onSpy.mock.calls.find((c) => c[0] === event);
	return call?.[1] as ((...args: unknown[]) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Flush micro-tasks
// ---------------------------------------------------------------------------

async function flush(): Promise<void> {
	await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Test 1 — index.buildFull called exactly once on first 'resolved'
// ---------------------------------------------------------------------------

describe("T2.4 — index lifecycle: metadataCache 'resolved'", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("builds the index at onLayoutReady, without waiting for a 'resolved' event", async () => {
		// Repro of the already-resolved-vault bug: when the plugin is enabled while
		// the vault is open, 'resolved' has already fired, so the index must be
		// built at layout-ready instead. The mock fires onLayoutReady synchronously.
		const app = makeApp();
		const { LinkGraphIndex } = await import("graph/LinkGraphIndex");
		const buildFullSpy = vi.spyOn(LinkGraphIndex.prototype, "buildFull");

		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		// Built during onload (layout-ready) — no 'resolved' was ever fired here.
		expect(buildFullSpy).toHaveBeenCalled();
		buildFullSpy.mockRestore();
	});

	it("rebuilds (debounced) on 'resolved' after a structural change (file created)", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const resolvedHandler = getRegisteredHandler(
			app.metadataCache.on as ReturnType<typeof vi.fn>,
			"resolved",
		);
		const createHandler = getRegisteredHandler(
			app.vault.on as ReturnType<typeof vi.fn>,
			"create",
		);
		expect(resolvedHandler).toBeDefined();
		expect(createHandler).toBeDefined();

		const index = (plugin as unknown as { _index: { buildFull: () => void } })._index;
		const buildFullSpy = vi.spyOn(index, "buildFull");

		// A file is created → flags a structural change; the next 'resolved' rebuilds.
		createHandler?.();
		resolvedHandler?.();
		expect(buildFullSpy).not.toHaveBeenCalled(); // debounced, not immediate
		vi.advanceTimersByTime(1000);
		expect(buildFullSpy).toHaveBeenCalledTimes(1);
	});

	it("does NOT rebuild on 'resolved' without a structural change (plain edit)", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const resolvedHandler = getRegisteredHandler(
			app.metadataCache.on as ReturnType<typeof vi.fn>,
			"resolved",
		);

		const index = (plugin as unknown as { _index: { buildFull: () => void } })._index;
		const buildFullSpy = vi.spyOn(index, "buildFull");

		// No create/delete/rename happened — 'changed' already handled the edit.
		resolvedHandler?.();
		vi.advanceTimersByTime(1000);
		expect(buildFullSpy).not.toHaveBeenCalled();
	});

	it("coalesces post-structural 'resolved' events into a single rebuild", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const resolvedHandler = getRegisteredHandler(
			app.metadataCache.on as ReturnType<typeof vi.fn>,
			"resolved",
		);
		const deleteHandler = getRegisteredHandler(
			app.vault.on as ReturnType<typeof vi.fn>,
			"delete",
		);

		const index = (plugin as unknown as { _index: { buildFull: () => void } })._index;
		const buildFullSpy = vi.spyOn(index, "buildFull");

		// One structural change, several 'resolved' fires → exactly one rebuild.
		deleteHandler?.({ path: "gone.md" });
		resolvedHandler?.();
		resolvedHandler?.();
		resolvedHandler?.();
		vi.advanceTimersByTime(1000);

		expect(buildFullSpy).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// Test 2 — 'changed' updates index synchronously and schedules repaint
// ---------------------------------------------------------------------------

describe("T2.4 — metadataCache 'changed' event", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("calls index.updateFile synchronously (not debounced) when 'changed' fires", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const changedHandler = getRegisteredHandler(
			app.metadataCache.on as ReturnType<typeof vi.fn>,
			"changed",
		);
		expect(changedHandler).toBeDefined();

		const index = (plugin as unknown as { _index: { updateFile: (p: string) => void } })._index;
		const updateSpy = vi.spyOn(index, "updateFile");

		const mockFile = { path: "notes/foo.md" };
		changedHandler?.(mockFile);

		// Must be called synchronously — no timer advance needed
		expect(updateSpy).toHaveBeenCalledWith("notes/foo.md");
		expect(updateSpy).toHaveBeenCalledTimes(1);
	});

	it("schedules a repaint (calls _repaintActivePanel) after 'changed'", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const changedHandler = getRegisteredHandler(
			app.metadataCache.on as ReturnType<typeof vi.fn>,
			"changed",
		);
		expect(changedHandler).toBeDefined();

		const repaintSpy = vi.spyOn(
			plugin as unknown as { _repaintActivePanel: () => void },
			"_repaintActivePanel",
		);

		const mockFile = { path: "notes/bar.md" };
		changedHandler?.(mockFile);

		await flush();
		expect(repaintSpy).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// Test 3 — vault 'rename' and 'delete' update index
// ---------------------------------------------------------------------------

describe("T2.4 — vault rename and delete events", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("vault 'rename' calls index.renameFile(oldPath, newPath) and schedules a repaint", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		// vault.on is a vi.fn() — check it was called with 'rename'
		const vaultOn = app.vault as unknown as {
			on: ReturnType<typeof vi.fn>;
		};
		const renameHandler = getRegisteredHandler(vaultOn.on, "rename");
		expect(renameHandler).toBeDefined();

		const index = (plugin as unknown as { _index: { renameFile: (o: string, n: string) => void } })._index;
		const renameSpy = vi.spyOn(index, "renameFile");
		const repaintSpy = vi.spyOn(
			plugin as unknown as { _repaintActivePanel: () => void },
			"_repaintActivePanel",
		);

		const newFile = { path: "notes/new.md", basename: "new" };
		renameHandler?.(newFile, "notes/old.md");

		expect(renameSpy).toHaveBeenCalledWith("notes/old.md", "notes/new.md");
		expect(repaintSpy).toHaveBeenCalledTimes(1);
	});

	it("vault 'delete' calls index.removeFile(path) and schedules a repaint", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const vaultOn = app.vault as unknown as {
			on: ReturnType<typeof vi.fn>;
		};
		const deleteHandler = getRegisteredHandler(vaultOn.on, "delete");
		expect(deleteHandler).toBeDefined();

		const index = (plugin as unknown as { _index: { removeFile: (p: string) => void } })._index;
		const removeSpy = vi.spyOn(index, "removeFile");
		const repaintSpy = vi.spyOn(
			plugin as unknown as { _repaintActivePanel: () => void },
			"_repaintActivePanel",
		);

		const file = { path: "notes/deleted.md" };
		deleteHandler?.(file);

		expect(removeSpy).toHaveBeenCalledWith("notes/deleted.md");
		expect(repaintSpy).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// Test 4 — active-leaf-change debounce coalescing
// ---------------------------------------------------------------------------

describe("T2.4 — active-leaf-change debounce coalescing", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("three rapid active-leaf-change events produce exactly ONE refresh after the debounce window (trailing)", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const leafChangeHandler = getRegisteredHandler(
			app.workspace.on as ReturnType<typeof vi.fn>,
			"active-leaf-change",
		);
		expect(leafChangeHandler).toBeDefined();

		// Spy on the plugin's internal repaint method to count actual refresh calls
		const repaintSpy = vi.spyOn(
			plugin as unknown as { _repaintActivePanel: () => void },
			"_repaintActivePanel",
		);

		// Fire three rapid events within the debounce window (default 300ms)
		leafChangeHandler?.();
		leafChangeHandler?.();
		leafChangeHandler?.();

		// None should fire before the window elapses (trailing debounce resets timer)
		expect(repaintSpy).not.toHaveBeenCalled();

		// Advance past the debounce window
		vi.advanceTimersByTime(400);
		await flush();

		// Exactly one refresh fires after the burst settles (trailing debounce)
		expect(repaintSpy).toHaveBeenCalledTimes(1);

		// Debouncer must still be accessible for cancel assertion
		const debouncer = (plugin as unknown as { _refreshDebouncer?: { cancel: () => void } })._refreshDebouncer;
		expect(debouncer).toBeDefined();
	});

	it("debounce timer is cleared when plugin unloads (_runCleanup)", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const debouncer = (plugin as unknown as { _refreshDebouncer?: { cancel: () => void } })._refreshDebouncer;
		expect(debouncer).toBeDefined();

		const cancelSpy = vi.spyOn(debouncer as { cancel: () => void }, "cancel");

		// Simulate unload
		plugin._runCleanup();

		expect(cancelSpy).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// Test 5 — cleanup: all events registered via registerEvent, cleared on unload
// ---------------------------------------------------------------------------

describe("T2.4 — event cleanup via registerEvent", () => {
	it("all workspace/metadataCache/vault events are registered via registerEvent", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);

		const registerEventSpy = vi.spyOn(plugin, "registerEvent");
		await plugin.onload();
		await flush();

		// registerEvent must have been called (at least 4 times: resolved, changed, rename, delete, active-leaf-change)
		expect(registerEventSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
	});

	it("_runCleanup cancels the debouncer and cleans up event listeners", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const debouncer = (plugin as unknown as { _refreshDebouncer?: { cancel: () => void } })._refreshDebouncer;
		expect(debouncer).toBeDefined();

		const cancelSpy = vi.spyOn(debouncer as { cancel: () => void }, "cancel");

		// Run cleanup
		plugin._runCleanup();

		expect(cancelSpy).toHaveBeenCalledOnce();
	});

	it("plugin exposes _index as a LinkGraphIndex instance", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const { LinkGraphIndex } = await import("graph/LinkGraphIndex");
		const index = (plugin as unknown as { _index: unknown })._index;
		expect(index).toBeInstanceOf(LinkGraphIndex);
	});
});

// ---------------------------------------------------------------------------
// T4.3b — RecentFilesStore event wiring
// ---------------------------------------------------------------------------

describe("T4.3b — RecentFilesStore event wiring", () => {
	it("plugin exposes _recentStore after onload", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const { RecentFilesStore } = await import("recent/RecentFilesStore");
		const store = (plugin as unknown as { _recentStore: unknown })._recentStore;
		expect(store).toBeInstanceOf(RecentFilesStore);
	});

	it("'file-open' handler calls store.onFileOpen(path, basename) for a markdown TFile", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const store = (plugin as unknown as { _recentStore: { onFileOpen: (path: string, basename: string) => Promise<void> } })._recentStore;
		const onFileOpenSpy = vi.spyOn(store, "onFileOpen").mockResolvedValue(undefined);

		const fileOpenHandler = getRegisteredHandler(
			app.workspace.on as ReturnType<typeof vi.fn>,
			"file-open",
		);
		expect(fileOpenHandler).toBeDefined();

		// Simulate opening a markdown TFile
		const { TFile } = await import("./__mocks__/obsidian");
		const mockFile = new TFile();
		mockFile.path = "notes/hello.md";
		mockFile.basename = "hello";
		mockFile.extension = "md";
		fileOpenHandler?.(mockFile);

		expect(onFileOpenSpy).toHaveBeenCalledWith("notes/hello.md", "hello");
	});

	it("'file-open' handler is a no-op when file is null (guard)", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const store = (plugin as unknown as { _recentStore: { onFileOpen: (path: string, basename: string) => Promise<void> } })._recentStore;
		const onFileOpenSpy = vi.spyOn(store, "onFileOpen").mockResolvedValue(undefined);

		const fileOpenHandler = getRegisteredHandler(
			app.workspace.on as ReturnType<typeof vi.fn>,
			"file-open",
		);

		// null file — should not throw and should not call onFileOpen
		expect(() => fileOpenHandler?.(null)).not.toThrow();
		expect(onFileOpenSpy).not.toHaveBeenCalled();
	});

	it("vault 'rename' also calls store.rename(oldPath, newPath, newBasename)", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const store = (plugin as unknown as { _recentStore: { rename: (o: string, n: string, nb: string) => Promise<void> } })._recentStore;
		const renameSpy = vi.spyOn(store, "rename").mockResolvedValue(undefined);

		const vaultOn = app.vault as unknown as { on: ReturnType<typeof vi.fn> };
		const renameHandler = getRegisteredHandler(vaultOn.on, "rename");
		expect(renameHandler).toBeDefined();

		const { TFile } = await import("./__mocks__/obsidian");
		const newFile = new TFile();
		newFile.path = "notes/new.md";
		newFile.basename = "new";
		newFile.extension = "md";
		renameHandler?.(newFile, "notes/old.md");

		expect(renameSpy).toHaveBeenCalledWith("notes/old.md", "notes/new.md", "new");
	});

	it("vault 'delete' also calls store.delete(path)", async () => {
		const app = makeApp();
		const plugin = await makePlugin(app);
		await plugin.onload();
		await flush();

		const store = (plugin as unknown as { _recentStore: { delete: (p: string) => Promise<void> } })._recentStore;
		const deleteSpy = vi.spyOn(store, "delete").mockResolvedValue(undefined);

		const vaultOn = app.vault as unknown as { on: ReturnType<typeof vi.fn> };
		const deleteHandler = getRegisteredHandler(vaultOn.on, "delete");
		expect(deleteHandler).toBeDefined();

		const { TFile } = await import("./__mocks__/obsidian");
		const deletedFile = new TFile();
		deletedFile.path = "notes/gone.md";
		deletedFile.extension = "md";
		deleteHandler?.(deletedFile);

		expect(deleteSpy).toHaveBeenCalledWith("notes/gone.md");
	});
});
