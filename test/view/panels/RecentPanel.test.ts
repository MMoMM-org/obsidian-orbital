/**
 * T4.3 — RecentPanel unit tests
 *
 * Tests cover:
 * - Renders MRU rows (basename label)
 * - Basename collision disambiguation (muted folder path shown)
 * - Click opens current leaf (Keymap.isModEvent=false)
 * - Cmd/ctrl-click opens new leaf (Keymap.isModEvent=true)
 * - Per-row remove calls store.removeOne + re-renders
 * - Clear-list calls store.clear + re-renders
 * - Draggable rows — dragstart wired to DragInsertHelper.onDragStart
 * - Mobile insert action calls DragInsertHelper.insertAtCursor
 * - Clicking a now-missing file shows Notice + self-heals via store.delete
 * - Empty state when list is empty
 *
 * TDD: these tests were written BEFORE the implementation (RED phase).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, Keymap, Notice, Platform, augmentEl } from "../../__mocks__/obsidian";
import { RecentPanel } from "view/panels/RecentPanel";
import type { RecentPanelDeps, RecentPanelApp } from "view/panels/RecentPanel";
import type { RecentFileEntry } from "recent/RecentFilesStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

type FakeStore = {
	entries: RecentFileEntry[];
	list: () => readonly RecentFileEntry[];
	removeOne: ReturnType<typeof vi.fn>;
	clear: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
};

function makeFakeStore(entries: RecentFileEntry[] = []): FakeStore {
	const store: FakeStore = {
		entries: [...entries],
		list: () => store.entries,
		removeOne: vi.fn(async (path: string) => {
			store.entries = store.entries.filter((e) => e.path !== path);
		}),
		clear: vi.fn(async () => {
			store.entries = [];
		}),
		delete: vi.fn(async (path: string) => {
			store.entries = store.entries.filter((e) => e.path !== path);
		}),
	};
	return store;
}

type FakeDragHelper = {
	onDragStart: ReturnType<typeof vi.fn>;
	insertAtCursor: ReturnType<typeof vi.fn>;
};

function makeFakeDragHelper(): FakeDragHelper {
	return {
		onDragStart: vi.fn(),
		insertAtCursor: vi.fn(),
	};
}

type MakeDepsOptions = {
	entries?: RecentFileEntry[];
	fileExists?: (path: string) => boolean;
	isMobile?: boolean;
};

function makeDeps(opts: MakeDepsOptions = {}): RecentPanelDeps & {
	appInstance: App;
	store: FakeStore;
	dragHelper: FakeDragHelper;
} {
	const appInstance = new App();
	const store = makeFakeStore(opts.entries ?? []);
	const dragHelper = makeFakeDragHelper();
	const fileExists = opts.fileExists ?? ((_path: string) => true);

	// Wire getAbstractFileByPath to the fileExists predicate
	vi.mocked(appInstance.vault.getAbstractFileByPath).mockImplementation(
		(path: string) => (fileExists(path) ? { path } : null),
	);

	const registerDomEvent = vi.fn(
		<K extends keyof HTMLElementEventMap>(
			el: HTMLElement,
			type: K,
			handler: (ev: HTMLElementEventMap[K]) => void,
		) => {
			el.addEventListener(type, handler as EventListener);
		},
	);

	const deps: RecentPanelDeps = {
		store,
		app: appInstance as unknown as RecentPanelApp,
		dragHelper,
		registerDomEvent,
	};

	return { ...deps, appInstance, store, dragHelper };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
	Notice._reset();
	Platform.isMobile = false;
	vi.mocked(Keymap.isModEvent).mockReturnValue(false);
});

afterEach(() => {
	Notice._reset();
	Platform.isMobile = false;
	vi.mocked(Keymap.isModEvent).mockReset();
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("RecentPanel empty state", () => {
	it("renders empty-state message when list is empty", () => {
		const deps = makeDeps({ entries: [] });
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const empty = container.querySelector(".orbit-recent-empty");
		expect(empty).not.toBeNull();
		expect(empty?.textContent).toMatch(/no recent files/i);
	});

	it("does not render any rows when list is empty", () => {
		const deps = makeDeps({ entries: [] });
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const rows = container.querySelectorAll(".orbit-recent-row");
		expect(rows.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

describe("RecentPanel row rendering", () => {
	it("renders one row per entry", () => {
		const deps = makeDeps({
			entries: [
				{ path: "notes/alpha.md", basename: "alpha" },
				{ path: "notes/beta.md", basename: "beta" },
			],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const rows = container.querySelectorAll(".orbit-recent-row");
		expect(rows.length).toBe(2);
	});

	it("renders basename as the main label", () => {
		const deps = makeDeps({
			entries: [{ path: "notes/my-note.md", basename: "my-note" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const label = container.querySelector(".orbit-recent-basename");
		expect(label?.textContent).toBe("my-note");
	});

	it("does not show muted path when no basename collision", () => {
		const deps = makeDeps({
			entries: [
				{ path: "a/alpha.md", basename: "alpha" },
				{ path: "b/beta.md", basename: "beta" },
			],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const mutedPaths = container.querySelectorAll(".orbit-recent-path");
		expect(mutedPaths.length).toBe(0);
	});

	it("shows muted folder path for both entries when basenames collide", () => {
		const deps = makeDeps({
			entries: [
				{ path: "folderA/note.md", basename: "note" },
				{ path: "folderB/note.md", basename: "note" },
			],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const mutedPaths = container.querySelectorAll(".orbit-recent-path");
		expect(mutedPaths.length).toBe(2);
		const pathTexts = Array.from(mutedPaths).map((el) => el.textContent ?? "");
		expect(pathTexts.some((t) => t.includes("folderA"))).toBe(true);
		expect(pathTexts.some((t) => t.includes("folderB"))).toBe(true);
	});

	it("rows have draggable=true attribute", () => {
		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const row = container.querySelector(".orbit-recent-row");
		expect(row?.getAttribute("draggable")).toBe("true");
	});

	it("renders a remove button with correct aria-label on each row", () => {
		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const removeBtn = container.querySelector("[aria-label='Remove from recent list']");
		expect(removeBtn).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Click navigation
// ---------------------------------------------------------------------------

describe("RecentPanel click navigation", () => {
	it("clicking a row calls getLeaf(false).openLinkText when not a mod-event", () => {
		vi.mocked(Keymap.isModEvent).mockReturnValue(false);

		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const mockLeaf = { openLinkText: vi.fn(async () => {}) };
		vi.mocked(deps.appInstance.workspace.getLeaf).mockReturnValue(
			mockLeaf as unknown as ReturnType<typeof deps.appInstance.workspace.getLeaf>,
		);

		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const row = container.querySelector(".orbit-recent-row") as HTMLElement;
		row.click();

		expect(deps.appInstance.workspace.getLeaf).toHaveBeenCalledWith(false);
		expect(mockLeaf.openLinkText).toHaveBeenCalledWith("notes/alpha.md", "", false);
	});

	it("clicking a row with Keymap.isModEvent=true calls getLeaf(true).openLinkText", () => {
		vi.mocked(Keymap.isModEvent).mockReturnValue(true);

		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const mockLeaf = { openLinkText: vi.fn(async () => {}) };
		vi.mocked(deps.appInstance.workspace.getLeaf).mockReturnValue(
			mockLeaf as unknown as ReturnType<typeof deps.appInstance.workspace.getLeaf>,
		);

		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const row = container.querySelector(".orbit-recent-row") as HTMLElement;
		row.click();

		expect(deps.appInstance.workspace.getLeaf).toHaveBeenCalledWith(true);
		expect(mockLeaf.openLinkText).toHaveBeenCalledWith("notes/alpha.md", "", true);
	});
});

// ---------------------------------------------------------------------------
// Missing-file self-heal
// ---------------------------------------------------------------------------

describe("RecentPanel missing-file self-heal", () => {
	it("clicking a missing file shows a Notice", () => {
		const deps = makeDeps({
			entries: [{ path: "notes/gone.md", basename: "gone" }],
			fileExists: () => false,
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const row = container.querySelector(".orbit-recent-row") as HTMLElement;
		row.click();

		expect(Notice._instances.length).toBeGreaterThan(0);
		expect(Notice._instances[0]?.message).toMatch(/no longer exists/i);
	});

	it("clicking a missing file calls store.delete", async () => {
		const deps = makeDeps({
			entries: [{ path: "notes/gone.md", basename: "gone" }],
			fileExists: () => false,
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const row = container.querySelector(".orbit-recent-row") as HTMLElement;
		row.click();

		// Allow the async delete + re-render to settle
		await vi.waitFor(() => {
			expect(deps.store.delete).toHaveBeenCalledWith("notes/gone.md");
		});
	});
});

// ---------------------------------------------------------------------------
// Per-row remove
// ---------------------------------------------------------------------------

describe("RecentPanel per-row remove", () => {
	it("clicking the remove button calls store.removeOne with the entry path", async () => {
		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const removeBtn = container.querySelector("[aria-label='Remove from recent list']") as HTMLElement;
		removeBtn.click();

		await vi.waitFor(() => {
			expect(deps.store.removeOne).toHaveBeenCalledWith("notes/alpha.md");
		});
	});

	it("after remove, the row is gone from the re-rendered list", async () => {
		const deps = makeDeps({
			entries: [
				{ path: "notes/alpha.md", basename: "alpha" },
				{ path: "notes/beta.md", basename: "beta" },
			],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const removeBtns = container.querySelectorAll("[aria-label='Remove from recent list']");
		(removeBtns[0] as HTMLElement).click();

		await vi.waitFor(() => {
			const rows = container.querySelectorAll(".orbit-recent-row");
			expect(rows.length).toBe(1);
		});
	});
});

// ---------------------------------------------------------------------------
// Clear list
// ---------------------------------------------------------------------------

describe("RecentPanel clear list", () => {
	it("renders a Clear list button", () => {
		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const clearBtn = container.querySelector("[aria-label='Clear list']");
		expect(clearBtn).not.toBeNull();
	});

	it("clicking Clear list calls store.clear", async () => {
		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const clearBtn = container.querySelector("[aria-label='Clear list']") as HTMLElement;
		clearBtn.click();

		await vi.waitFor(() => {
			expect(deps.store.clear).toHaveBeenCalled();
		});
	});

	it("after clear, the list is empty and shows empty state", async () => {
		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const clearBtn = container.querySelector("[aria-label='Clear list']") as HTMLElement;
		clearBtn.click();

		await vi.waitFor(() => {
			const empty = container.querySelector(".orbit-recent-empty");
			expect(empty).not.toBeNull();
		});
	});
});

// ---------------------------------------------------------------------------
// Drag
// ---------------------------------------------------------------------------

describe("RecentPanel drag", () => {
	it("dragstart on a row calls dragHelper.onDragStart with the entry path", () => {
		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});

		// Capture the registered dragstart handler so we can call it
		// without relying on DragEvent (unavailable in jsdom).
		let capturedHandler: ((evt: Event) => void) | undefined;
		const origRegister = deps.registerDomEvent as ReturnType<typeof vi.fn>;
		origRegister.mockImplementation(
			<K extends keyof HTMLElementEventMap>(
				el: HTMLElement,
				type: K,
				handler: (ev: HTMLElementEventMap[K]) => void,
			) => {
				el.addEventListener(type, handler as EventListener);
				if (type === "dragstart") {
					capturedHandler = handler as (evt: Event) => void;
				}
			},
		);

		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		expect(capturedHandler).toBeDefined();
		const fakeEvent = { type: "dragstart" } as unknown as DragEvent;
		capturedHandler!(fakeEvent);

		expect(deps.dragHelper.onDragStart).toHaveBeenCalledWith(
			fakeEvent,
			"notes/alpha.md",
		);
	});
});

// ---------------------------------------------------------------------------
// Mobile insert action
// ---------------------------------------------------------------------------

describe("RecentPanel mobile insert action", () => {
	it("renders an insert button on each row when Platform.isMobile=true", () => {
		Platform.isMobile = true;

		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const insertBtn = container.querySelector("[aria-label='Insert link at Cursor']");
		expect(insertBtn).not.toBeNull();
	});

	it("clicking the insert button calls dragHelper.insertAtCursor with the entry basename", () => {
		Platform.isMobile = true;

		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const insertBtn = container.querySelector("[aria-label='Insert link at Cursor']") as HTMLElement;
		insertBtn.click();

		expect(deps.dragHelper.insertAtCursor).toHaveBeenCalledWith("alpha");
	});

	it("does not render insert button when Platform.isMobile=false", () => {
		Platform.isMobile = false;

		const deps = makeDeps({
			entries: [{ path: "notes/alpha.md", basename: "alpha" }],
		});
		const panel = new RecentPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const insertBtn = container.querySelector("[aria-label='Insert link at Cursor']");
		expect(insertBtn).toBeNull();
	});
});
