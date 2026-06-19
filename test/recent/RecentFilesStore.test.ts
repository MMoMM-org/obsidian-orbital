/**
 * RecentFilesStore unit tests — T4.1
 *
 * Tests exercise the public API only. All Obsidian runtime dependencies
 * (settings persistence, exclusion) are injected as plain stubs so no
 * real Obsidian runtime is needed.
 *
 * TDD: these tests were written BEFORE the implementation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecentFilesStore } from "recent/RecentFilesStore";
import type { RecentFilesStoreDeps } from "recent/RecentFilesStore";
import type { OrbitSettings } from "types/index";
import { DEFAULT_SETTINGS } from "types/index";

// ---------------------------------------------------------------------------
// Helpers / factories
// ---------------------------------------------------------------------------

function makeSettings(overrides?: Partial<OrbitSettings>): OrbitSettings {
	return {
		...DEFAULT_SETTINGS,
		recentListLength: 5,
		recentFiles: [],
		...overrides,
	};
}

function makeDeps(settings: OrbitSettings): RecentFilesStoreDeps & {
	saveSettings: ReturnType<typeof vi.fn>;
	isExcluded: ReturnType<typeof vi.fn>;
} {
	const saveSettings = vi.fn(async () => {});
	const isExcluded = vi.fn((_path: string) => false);
	return {
		getSettings: () => settings,
		saveSettings,
		isExcluded,
	};
}

// ---------------------------------------------------------------------------
// list() — initial state
// ---------------------------------------------------------------------------

describe("RecentFilesStore — list()", () => {
	it("returns empty list when settings.recentFiles is empty", () => {
		const settings = makeSettings();
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		expect(store.list()).toEqual([]);
	});

	it("returns the current settings.recentFiles on construction (survives reload)", () => {
		const preloaded = [
			{ path: "notes/a.md", basename: "a" },
			{ path: "notes/b.md", basename: "b" },
		];
		const settings = makeSettings({ recentFiles: preloaded });
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		expect(store.list()).toEqual(preloaded);
	});

	it("list() returns readonly — mutations on returned array do not affect store", () => {
		const settings = makeSettings({ recentFiles: [{ path: "a.md", basename: "a" }] });
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		const snapshot = store.list() as { path: string; basename: string }[];
		snapshot.push({ path: "injected.md", basename: "injected" });

		expect(store.list()).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// onFileOpen — MRU prepend + dedup
// ---------------------------------------------------------------------------

describe("RecentFilesStore — onFileOpen()", () => {
	it("prepends the opened file to the front of the list", async () => {
		const settings = makeSettings();
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.onFileOpen("notes/a.md", "a");

		expect(store.list()[0]).toEqual({ path: "notes/a.md", basename: "a" });
	});

	it("deduplicates: opening an already-listed file moves it to front", async () => {
		const settings = makeSettings({
			recentFiles: [
				{ path: "notes/a.md", basename: "a" },
				{ path: "notes/b.md", basename: "b" },
			],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.onFileOpen("notes/b.md", "b");

		expect(store.list()[0]).toEqual({ path: "notes/b.md", basename: "b" });
		expect(store.list()).toHaveLength(2);
	});

	it("does not create duplicates when re-opening the current head file", async () => {
		const settings = makeSettings({
			recentFiles: [{ path: "notes/a.md", basename: "a" }],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.onFileOpen("notes/a.md", "a");

		expect(store.list()).toHaveLength(1);
	});

	it("prunes list to recentListLength after prepend", async () => {
		const settings = makeSettings({
			recentListLength: 3,
			recentFiles: [
				{ path: "1.md", basename: "1" },
				{ path: "2.md", basename: "2" },
				{ path: "3.md", basename: "3" },
			],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.onFileOpen("new.md", "new");

		expect(store.list()).toHaveLength(3);
		expect(store.list()[0]).toEqual({ path: "new.md", basename: "new" });
		// oldest entry (3.md) should be dropped
		expect(store.list().map((f) => f.path)).not.toContain("3.md");
	});

	it("persists to settings.recentFiles and calls saveSettings after add", async () => {
		const settings = makeSettings();
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.onFileOpen("notes/a.md", "a");

		expect(settings.recentFiles).toEqual([{ path: "notes/a.md", basename: "a" }]);
		expect(deps.saveSettings).toHaveBeenCalledOnce();
	});

	it("does not add excluded files", async () => {
		const settings = makeSettings();
		const deps = makeDeps(settings);
		deps.isExcluded.mockReturnValue(true);
		const store = new RecentFilesStore(deps);

		await store.onFileOpen("daily/2024-01-01.md", "2024-01-01");

		expect(store.list()).toHaveLength(0);
		expect(deps.saveSettings).not.toHaveBeenCalled();
	});

	it("reads recentListLength live — lowering the cap re-prunes on next mutation", async () => {
		const settings = makeSettings({
			recentListLength: 5,
			recentFiles: [
				{ path: "1.md", basename: "1" },
				{ path: "2.md", basename: "2" },
				{ path: "3.md", basename: "3" },
				{ path: "4.md", basename: "4" },
			],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		// Lower cap in settings (simulates user changing the setting)
		settings.recentListLength = 2;

		await store.onFileOpen("new.md", "new");

		expect(store.list()).toHaveLength(2);
		expect(store.list()[0]).toEqual({ path: "new.md", basename: "new" });
	});
});

// ---------------------------------------------------------------------------
// rename()
// ---------------------------------------------------------------------------

describe("RecentFilesStore — rename()", () => {
	it("updates path and basename for a renamed file in place", async () => {
		const settings = makeSettings({
			recentFiles: [
				{ path: "notes/old.md", basename: "old" },
				{ path: "notes/other.md", basename: "other" },
			],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.rename("notes/old.md", "notes/new.md", "new");

		expect(store.list()).toHaveLength(2);
		expect(store.list()[0]).toEqual({ path: "notes/new.md", basename: "new" });
		expect(store.list()[1]).toEqual({ path: "notes/other.md", basename: "other" });
	});

	it("preserves list order when renaming a middle entry", async () => {
		const settings = makeSettings({
			recentFiles: [
				{ path: "a.md", basename: "a" },
				{ path: "b.md", basename: "b" },
				{ path: "c.md", basename: "c" },
			],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.rename("b.md", "b-renamed.md", "b-renamed");

		expect(store.list().map((f) => f.path)).toEqual([
			"a.md",
			"b-renamed.md",
			"c.md",
		]);
	});

	it("persists after rename", async () => {
		const settings = makeSettings({
			recentFiles: [{ path: "old.md", basename: "old" }],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.rename("old.md", "new.md", "new");

		expect(deps.saveSettings).toHaveBeenCalledOnce();
		expect(settings.recentFiles[0]).toEqual({ path: "new.md", basename: "new" });
	});

	it("is a no-op when the path is not in the list", async () => {
		const settings = makeSettings({
			recentFiles: [{ path: "a.md", basename: "a" }],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.rename("ghost.md", "ghost-new.md", "ghost-new");

		expect(store.list()).toEqual([{ path: "a.md", basename: "a" }]);
		expect(deps.saveSettings).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// delete()
// ---------------------------------------------------------------------------

describe("RecentFilesStore — delete()", () => {
	it("removes the deleted file from the list", async () => {
		const settings = makeSettings({
			recentFiles: [
				{ path: "a.md", basename: "a" },
				{ path: "b.md", basename: "b" },
			],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.delete("a.md");

		expect(store.list()).toHaveLength(1);
		expect(store.list()[0]).toEqual({ path: "b.md", basename: "b" });
	});

	it("persists after delete", async () => {
		const settings = makeSettings({
			recentFiles: [{ path: "a.md", basename: "a" }],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.delete("a.md");

		expect(deps.saveSettings).toHaveBeenCalledOnce();
		expect(settings.recentFiles).toEqual([]);
	});

	it("is a no-op when the path is not in the list", async () => {
		const settings = makeSettings({
			recentFiles: [{ path: "a.md", basename: "a" }],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.delete("ghost.md");

		expect(store.list()).toEqual([{ path: "a.md", basename: "a" }]);
		expect(deps.saveSettings).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// removeOne()
// ---------------------------------------------------------------------------

describe("RecentFilesStore — removeOne()", () => {
	it("removes a single entry from the list and persists", async () => {
		const settings = makeSettings({
			recentFiles: [
				{ path: "a.md", basename: "a" },
				{ path: "b.md", basename: "b" },
			],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.removeOne("a.md");

		expect(store.list()).toEqual([{ path: "b.md", basename: "b" }]);
		expect(deps.saveSettings).toHaveBeenCalledOnce();
	});

	it("is a no-op when the path is not present", async () => {
		const settings = makeSettings({
			recentFiles: [{ path: "a.md", basename: "a" }],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.removeOne("ghost.md");

		expect(store.list()).toEqual([{ path: "a.md", basename: "a" }]);
		expect(deps.saveSettings).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

describe("RecentFilesStore — clear()", () => {
	it("empties the list and persists", async () => {
		const settings = makeSettings({
			recentFiles: [
				{ path: "a.md", basename: "a" },
				{ path: "b.md", basename: "b" },
			],
		});
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.clear();

		expect(store.list()).toEqual([]);
		expect(deps.saveSettings).toHaveBeenCalledOnce();
		expect(settings.recentFiles).toEqual([]);
	});

	it("is still safe and calls saveSettings on an already-empty list", async () => {
		const settings = makeSettings();
		const deps = makeDeps(settings);
		const store = new RecentFilesStore(deps);

		await store.clear();

		expect(store.list()).toEqual([]);
		expect(deps.saveSettings).toHaveBeenCalledOnce();
	});
});
