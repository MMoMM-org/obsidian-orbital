/**
 * T3.4 — DanglingPanel unit tests
 *
 * RED phase: tests written BEFORE implementation.
 *
 * Coverage:
 * - by-target grouping (default): group header = dangling target, children = source files
 * - by-source grouping: group header = source file, children = dangling targets
 * - scope toggle: vault vs folder
 * - count badges shown/hidden based on showCounts setting
 * - four inline actions (rename, alias, create, delete) per target row
 * - each action opens the correct modal/flow and calls the correct service method
 * - "Manage →" deep-link: activeFilter set by caller drives scroll/highlight
 * - positive empty state when no dangling targets in scope
 * - bulk result surfaced via Notice + aria-live region
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Notice, augmentEl } from "../../__mocks__/obsidian";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { MetadataCache as IndexMetadataCache } from "graph/LinkGraphIndex";
import { DanglingPanel } from "view/panels/DanglingPanel";
import type { DanglingPanelDeps } from "view/panels/DanglingPanel";
import type { OrbitSettings, DanglingGrouping, DanglingScope } from "types/index";
import { DEFAULT_SETTINGS } from "types/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(overrides?: Partial<OrbitSettings>): OrbitSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

function buildIndex(
	unresolved: Record<string, Record<string, number>> = {},
): LinkGraphIndex {
	const app = new App();
	app.metadataCache.unresolvedLinks = unresolved;
	const idx = new LinkGraphIndex(app.metadataCache as unknown as IndexMetadataCache);
	idx.buildFull();
	return idx;
}

function makeContainer(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

// ---------------------------------------------------------------------------
// Mock service and modal factories
// ---------------------------------------------------------------------------

function makeMockService() {
	return {
		previewRename: vi.fn(async () => ({ occurrences: 3, files: [{ path: "a.md", count: 2 }, { path: "b.md", count: 1 }] })),
		applyRename: vi.fn(async () => ({ filesSucceeded: 2, filesFailed: [] })),
		applyAlias: vi.fn(async () => ({ filesSucceeded: 2, filesFailed: [] })),
		applyDelete: vi.fn(async () => ({ filesSucceeded: 2, filesFailed: [] })),
	};
}

function makeMockConfirmRewriteModal() {
	return vi.fn().mockImplementation((_app: unknown, opts: { onConfirm: (name: string) => void }) => ({
		open: vi.fn(() => {
			// Simulate immediate confirm for testing
			opts.onConfirm("NewName");
		}),
	}));
}

function makeMockFolderPicker() {
	return vi.fn().mockImplementation(() => ({
		pickFolder: vi.fn(async () => ({ path: "Notes" })),
	}));
}

function makeMockNotePicker() {
	return vi.fn().mockImplementation(() => ({
		pickNote: vi.fn(async () => ({ path: "Notes/SomeNote.md" })),
	}));
}

function makeMockCreateNote() {
	return vi.fn(async () => ({ file: { path: "Notes/Target.md" }, existed: false }));
}

type DepsOverrides = {
	settings?: Partial<OrbitSettings>;
	unresolved?: Record<string, Record<string, number>>;
	grouping?: DanglingGrouping;
	scope?: DanglingScope;
	folderPath?: string;
	activeFilter?: string | null;
};

function makeDeps(overrides: DepsOverrides = {}): DanglingPanelDeps & {
	appInstance: App;
	service: ReturnType<typeof makeMockService>;
	ConfirmRewriteModal: ReturnType<typeof makeMockConfirmRewriteModal>;
	folderPicker: ReturnType<typeof makeMockFolderPicker>;
	notePicker: ReturnType<typeof makeMockNotePicker>;
	createNote: ReturnType<typeof makeMockCreateNote>;
	_getActiveFilter: () => string | null;
} {
	const appInstance = new App();
	const unresolved = overrides.unresolved ?? {};
	appInstance.metadataCache.unresolvedLinks = unresolved;

	const index = buildIndex(unresolved);
	const settings = makeSettings(overrides.settings);
	const service = makeMockService();
	const ConfirmRewriteModal = makeMockConfirmRewriteModal();
	const folderPicker = makeMockFolderPicker();
	const notePicker = makeMockNotePicker();
	const createNote = makeMockCreateNote();

	let grouping: DanglingGrouping = overrides.grouping ?? settings.danglingGrouping;
	let scope: DanglingScope = overrides.scope ?? settings.danglingDefaultScope;
	let activeFilter: string | null = overrides.activeFilter ?? null;

	const registerDomEvent = vi.fn(
		<K extends keyof HTMLElementEventMap>(
			el: HTMLElement,
			type: K,
			handler: (ev: HTMLElementEventMap[K]) => void,
		) => {
			el.addEventListener(type, handler as EventListener);
		},
	);

	const deps: DanglingPanelDeps = {
		index,
		getSettings: () => settings,
		app: appInstance,
		getGrouping: () => grouping,
		setGrouping: (g) => { grouping = g; },
		getScope: () => scope,
		setScope: (s) => { scope = s; },
		getFolderPath: () => overrides.folderPath ?? "Notes",
		getActiveFilter: () => activeFilter,
		setActiveFilter: (t) => { activeFilter = t; },
		clearActiveFilter: () => { activeFilter = null; },
		service,
		ConfirmRewriteModal,
		folderPicker,
		notePicker,
		createNote,
		registerDomEvent,
	};

	return { ...deps, appInstance, service, ConfirmRewriteModal, folderPicker, notePicker, createNote, _getActiveFilter: () => activeFilter };
}

// ---------------------------------------------------------------------------
// By-target grouping (default)
// ---------------------------------------------------------------------------

describe("DanglingPanel by-target grouping", () => {
	beforeEach(() => {
		Notice._reset();
	});

	it("renders group headers for each dangling target", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/a.md": { "MissingNote": 1 },
				"notes/b.md": { "MissingNote": 2, "AnotherMissing": 1 },
			},
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const headers = container.querySelectorAll(".orbit-dangling-group-header");
		const headerTexts = Array.from(headers).map((h) => h.textContent?.trim() ?? "");
		expect(headerTexts.some((t) => t.includes("MissingNote"))).toBe(true);
		expect(headerTexts.some((t) => t.includes("AnotherMissing"))).toBe(true);
	});

	it("shows count badge per group when showCounts=true", () => {
		const deps = makeDeps({
			settings: { showCounts: true },
			unresolved: {
				"notes/a.md": { "MissingNote": 3 },
			},
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const badges = container.querySelectorAll(".orbit-dangling-count");
		expect(badges.length).toBeGreaterThan(0);
		expect(badges[0]?.textContent).toBe("3");
	});

	it("omits count badge when showCounts=false", () => {
		const deps = makeDeps({
			settings: { showCounts: false },
			unresolved: {
				"notes/a.md": { "MissingNote": 1 },
			},
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const badges = container.querySelectorAll(".orbit-dangling-count");
		expect(badges.length).toBe(0);
	});

	it("renders source file occurrences as children of each target group", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/source-a.md": { "MissingNote": 1 },
				"notes/source-b.md": { "MissingNote": 2 },
			},
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const occurrenceItems = container.querySelectorAll(".orbit-dangling-occurrence");
		expect(occurrenceItems.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// By-source grouping
// ---------------------------------------------------------------------------

describe("DanglingPanel by-source grouping", () => {
	it("renders group headers for each source file", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/source-a.md": { "MissingA": 1, "MissingB": 1 },
				"notes/source-b.md": { "MissingA": 2 },
			},
			grouping: "source",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const headers = container.querySelectorAll(".orbit-dangling-group-header");
		const headerTexts = Array.from(headers).map((h) => h.textContent?.trim() ?? "");
		expect(headerTexts.some((t) => t.includes("source-a"))).toBe(true);
		expect(headerTexts.some((t) => t.includes("source-b"))).toBe(true);
	});

	it("renders target items as children of source groups", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/source-a.md": { "MissingTarget": 2 },
			},
			grouping: "source",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const targetItems = container.querySelectorAll(".orbit-dangling-target-item");
		const texts = Array.from(targetItems).map((el) => el.textContent?.trim() ?? "");
		expect(texts.some((t) => t.includes("MissingTarget"))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Grouping toggle
// ---------------------------------------------------------------------------

describe("DanglingPanel grouping toggle", () => {
	it("renders a grouping toggle button", () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "Missing": 1 } },
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const toggleBtn = container.querySelector("[data-action='toggle-grouping']");
		expect(toggleBtn).not.toBeNull();
	});

	it("grouping toggle button is labeled for by-source switch when grouping is by-target", () => {
		const deps = makeDeps({
			grouping: "target",
			unresolved: { "notes/a.md": { "Missing": 1 } },
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const toggleBtn = container.querySelector("[data-action='toggle-grouping']");
		expect(toggleBtn?.getAttribute("aria-label")).toMatch(/source/i);
	});

	it("clicking grouping toggle calls setGrouping with the opposite value", () => {
		const deps = makeDeps({
			grouping: "target",
			unresolved: { "notes/a.md": { "Missing": 1 } },
		});
		const setGroupingSpy = vi.fn();
		deps.setGrouping = setGroupingSpy;

		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const toggleBtn = container.querySelector("[data-action='toggle-grouping']") as HTMLElement;
		toggleBtn.click();

		expect(setGroupingSpy).toHaveBeenCalledWith("source");
	});
});

// ---------------------------------------------------------------------------
// Scope toggle
// ---------------------------------------------------------------------------

describe("DanglingPanel scope toggle", () => {
	it("renders a scope toggle button", () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "Missing": 1 } },
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const scopeBtn = container.querySelector("[data-action='toggle-scope']");
		expect(scopeBtn).not.toBeNull();
	});

	it("scope button reflects vault label when scope=vault", () => {
		const deps = makeDeps({
			scope: "vault",
			unresolved: { "notes/a.md": { "Missing": 1 } },
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const scopeBtn = container.querySelector("[data-action='toggle-scope']");
		expect(scopeBtn?.textContent?.toLowerCase()).toContain("vault");
	});

	it("scope button reflects folder label when scope=folder", () => {
		const deps = makeDeps({
			scope: "folder",
			unresolved: { "notes/a.md": { "Missing": 1 } },
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const scopeBtn = container.querySelector("[data-action='toggle-scope']");
		expect(scopeBtn?.textContent?.toLowerCase()).toContain("folder");
	});

	it("clicking scope toggle calls setScope with opposite value", () => {
		const deps = makeDeps({
			scope: "vault",
			unresolved: { "notes/a.md": { "Missing": 1 } },
		});
		const setScopeSpy = vi.fn();
		deps.setScope = setScopeSpy;

		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const scopeBtn = container.querySelector("[data-action='toggle-scope']") as HTMLElement;
		scopeBtn.click();

		expect(setScopeSpy).toHaveBeenCalledWith("folder");
	});
});

// ---------------------------------------------------------------------------
// Inline actions (by-target grouping — actions are on the target header)
// ---------------------------------------------------------------------------

describe("DanglingPanel inline actions", () => {
	beforeEach(() => {
		Notice._reset();
	});

	it("renders rename, alias, create, delete action buttons per target group", () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		expect(container.querySelector("[aria-label='Rename dangling link']")).not.toBeNull();
		expect(container.querySelector("[aria-label='Alias to existing note']")).not.toBeNull();
		expect(container.querySelector("[aria-label='Create note']")).not.toBeNull();
		expect(container.querySelector("[aria-label='Delete links']")).not.toBeNull();
	});

	it("rename action calls previewRename then opens ConfirmRewriteModal", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const renameBtn = container.querySelector("[aria-label='Rename dangling link']") as HTMLElement;
		renameBtn.click();

		// Allow async ops
		await new Promise((r) => setTimeout(r, 0));

		expect(deps.service.previewRename).toHaveBeenCalledWith("MissingTarget", expect.any(Object));
		expect(deps.ConfirmRewriteModal).toHaveBeenCalled();
	});

	it("rename action: onConfirm calls applyRename with the entered name", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const renameBtn = container.querySelector("[aria-label='Rename dangling link']") as HTMLElement;
		renameBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		expect(deps.service.applyRename).toHaveBeenCalledWith("MissingTarget", "NewName", expect.any(Object));
	});

	it("rename action: bulk result shown via Notice", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const renameBtn = container.querySelector("[aria-label='Rename dangling link']") as HTMLElement;
		renameBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		expect(Notice._instances.length).toBeGreaterThan(0);
		expect(Notice._instances[0]!.message).toMatch(/2/);
	});

	it("delete action opens ConfirmRewriteModal with 'delete' kind", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const deleteBtn = container.querySelector("[aria-label='Delete links']") as HTMLElement;
		deleteBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		expect(deps.ConfirmRewriteModal).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ kind: "delete" }),
		);
	});

	it("delete action: onConfirm calls applyDelete with false when 'only in this note' is unchecked (default)", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		// Default ConfirmRewriteModal mock calls onConfirm("NewName") immediately on open,
		// simulating the user confirming without checking "only in this note".
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const deleteBtn = container.querySelector("[aria-label='Delete links']") as HTMLElement;
		deleteBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		// onlyInThisNote defaults to false (vault-wide delete)
		expect(deps.service.applyDelete).toHaveBeenCalledWith("MissingTarget", expect.any(Object), false);
	});

	it("delete action: applyDelete receives true when 'only in this note' is checked", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});

		// Override the ConfirmRewriteModal mock to set onlyInThisNote = true before calling onConfirm
		deps.ConfirmRewriteModal = vi.fn().mockImplementation((_app: unknown, opts: { onConfirm: (name: string) => void }) => ({
			onlyInThisNote: true,
			open: vi.fn(function (this: { onlyInThisNote: boolean }) {
				opts.onConfirm("NewName");
			}),
		})) as ReturnType<typeof makeMockConfirmRewriteModal>;

		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const deleteBtn = container.querySelector("[aria-label='Delete links']") as HTMLElement;
		deleteBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		expect(deps.service.applyDelete).toHaveBeenCalledWith("MissingTarget", expect.any(Object), true);
	});

	it("alias action calls previewRename and opens ConfirmRewriteModal with 'alias' kind", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const aliasBtn = container.querySelector("[aria-label='Alias to existing note']") as HTMLElement;
		aliasBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		expect(deps.ConfirmRewriteModal).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ kind: "alias" }),
		);
	});

	it("alias action: onConfirm calls applyAlias with the picked note .md path (ADR-6)", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const aliasBtn = container.querySelector("[aria-label='Alias to existing note']") as HTMLElement;
		aliasBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		// applyAlias called with the .md note path from NoteFilePicker (not a folder)
		expect(deps.service.applyAlias).toHaveBeenCalledWith("MissingTarget", "Notes/SomeNote.md", expect.any(Object));
	});

	it("create action calls createNote with target and app", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const createBtn = container.querySelector("[aria-label='Create note']") as HTMLElement;
		createBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		expect(deps.createNote).toHaveBeenCalledWith(
			"MissingTarget",
			expect.anything(),
			expect.anything(),
			expect.anything(),
		);
	});

	it("create action: shows success Notice when note created", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const createBtn = container.querySelector("[aria-label='Create note']") as HTMLElement;
		createBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		expect(Notice._instances.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("DanglingPanel empty state", () => {
	it("renders positive empty state when no dangling targets", () => {
		const deps = makeDeps({ unresolved: {} });
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const emptyEl = container.querySelector(".orbit-dangling-empty");
		expect(emptyEl).not.toBeNull();
		expect(emptyEl?.textContent).toMatch(/no dangling/i);
	});

	it("does not render empty state when there are dangling targets", () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "Missing": 1 } },
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const emptyEl = container.querySelector(".orbit-dangling-empty");
		expect(emptyEl).toBeNull();
	});

	it("renders empty state when folder scope has no dangling targets in that folder", () => {
		const deps = makeDeps({
			scope: "folder",
			folderPath: "other-folder",
			unresolved: { "notes/a.md": { "Missing": 1 } },
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		// "notes/a.md" is not under "other-folder", so scope yields nothing
		const emptyEl = container.querySelector(".orbit-dangling-empty");
		expect(emptyEl).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Aria-live region for bulk results
// ---------------------------------------------------------------------------

describe("DanglingPanel aria-live region", () => {
	beforeEach(() => {
		Notice._reset();
	});

	it("renders an aria-live='polite' region", () => {
		const deps = makeDeps({ unresolved: { "notes/a.md": { "Missing": 1 } } });
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const liveRegion = container.querySelector("[aria-live='polite']");
		expect(liveRegion).not.toBeNull();
	});

	it("populates the aria-live region after a bulk operation", async () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "MissingTarget": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const renameBtn = container.querySelector("[aria-label='Rename dangling link']") as HTMLElement;
		renameBtn.click();
		await new Promise((r) => setTimeout(r, 0));

		const liveRegion = container.querySelector("[aria-live='polite']") as HTMLElement;
		expect(liveRegion.textContent?.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// "Manage →" deep-link: activeFilter drives filter + highlight (T5.1)
// ---------------------------------------------------------------------------

describe("DanglingPanel deep-link via activeFilter", () => {
	it("renders only the active filter target group when activeFilter is set (filtered view)", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/a.md": { "TargetA": 1, "TargetB": 1 },
			},
			grouping: "target",
			activeFilter: "TargetA",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		// Only TargetA group should be rendered, not TargetB
		const targetARow = container.querySelector(".orbit-dangling-group[data-target='TargetA']");
		const targetBRow = container.querySelector(".orbit-dangling-group[data-target='TargetB']");
		expect(targetARow).not.toBeNull();
		expect(targetBRow).toBeNull();
	});

	it("scrolls to and highlights the filtered target row", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/a.md": { "TargetA": 1, "TargetB": 1 },
			},
			grouping: "target",
			activeFilter: "TargetA",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const targetARow = container.querySelector(".orbit-dangling-group[data-target='TargetA']");
		expect(targetARow?.classList.contains("is-highlighted")).toBe(true);
	});

	it("shows a 'Show all' button when filter is active", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/a.md": { "TargetA": 1, "TargetB": 1 },
			},
			grouping: "target",
			activeFilter: "TargetA",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const showAllBtn = container.querySelector("[data-action='clear-filter']");
		expect(showAllBtn).not.toBeNull();
	});

	it("activeFilter persists even when the scope yields no matching targets (W1 regression invariant)", () => {
		// activeFilter is set but the scope yields no dangling targets — the
		// empty-state renders normally; no mechanism should swallow the filter.
		const deps = makeDeps({
			unresolved: {},
			activeFilter: "Orphan",
		});

		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		// Empty state still renders (no targets in vault)
		expect(container.querySelector(".orbit-dangling-empty")).not.toBeNull();
		// The filter is still reported as active by the deps (not cleared by render)
		expect(deps._getActiveFilter()).toBe("Orphan");
	});
});

// ---------------------------------------------------------------------------
// Active filter (T5.1): filter persists across re-renders, "Show all" clears
// ---------------------------------------------------------------------------

describe("DanglingPanel activeFilter", () => {
	it("filters to the active filter target when activeFilter is set (no pendingTarget)", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/a.md": { "TargetA": 1, "TargetB": 1 },
			},
			grouping: "target",
			activeFilter: "TargetA",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const targetARow = container.querySelector(".orbit-dangling-group[data-target='TargetA']");
		const targetBRow = container.querySelector(".orbit-dangling-group[data-target='TargetB']");
		expect(targetARow).not.toBeNull();
		expect(targetBRow).toBeNull();
	});

	it("shows 'Show all' button when activeFilter is set", () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "TargetA": 1, "TargetB": 1 } },
			grouping: "target",
			activeFilter: "TargetA",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const showAllBtn = container.querySelector("[data-action='clear-filter']");
		expect(showAllBtn).not.toBeNull();
	});

	it("does not show 'Show all' button when no filter is active", () => {
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "TargetA": 1 } },
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const showAllBtn = container.querySelector("[data-action='clear-filter']");
		expect(showAllBtn).toBeNull();
	});

	it("clicking 'Show all' calls clearActiveFilter", () => {
		const clearActiveFilterSpy = vi.fn();
		const deps = makeDeps({
			unresolved: { "notes/a.md": { "TargetA": 1, "TargetB": 1 } },
			grouping: "target",
			activeFilter: "TargetA",
		});
		deps.clearActiveFilter = clearActiveFilterSpy;

		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const showAllBtn = container.querySelector("[data-action='clear-filter']") as HTMLElement;
		showAllBtn.click();

		expect(clearActiveFilterSpy).toHaveBeenCalled();
	});

	it("renders all targets when no activeFilter and no pendingTarget", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/a.md": { "TargetA": 1, "TargetB": 1 },
			},
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		const targetARow = container.querySelector(".orbit-dangling-group[data-target='TargetA']");
		const targetBRow = container.querySelector(".orbit-dangling-group[data-target='TargetB']");
		expect(targetARow).not.toBeNull();
		expect(targetBRow).not.toBeNull();
	});

	it("filter survives a re-render (activeFilter persists across renders)", () => {
		// Simulates a second render (e.g. vault change) while the filter is active.
		const deps = makeDeps({
			unresolved: {
				"notes/a.md": { "TargetA": 1, "TargetB": 1 },
			},
			grouping: "target",
			activeFilter: "TargetA",
		});
		const panel = new DanglingPanel(deps);
		const container1 = makeContainer();
		panel.render(container1);

		// Re-render into a second container (simulates vault change re-render)
		const container2 = makeContainer();
		panel.render(container2);

		const targetARow = container2.querySelector(".orbit-dangling-group[data-target='TargetA']");
		const targetBRow = container2.querySelector(".orbit-dangling-group[data-target='TargetB']");
		expect(targetARow).not.toBeNull();
		expect(targetBRow).toBeNull();
	});

	// S2: activeFilter works correctly under source grouping
	it("activeFilter set while grouping === 'source' still shows only the matching target within source groups", () => {
		// Source grouping inverts the tree: source files are group headers, targets are children.
		// When activeFilter is set, the rendered targets list is pre-filtered to the matching
		// DanglingTarget, so source groups that don't link to the filter target disappear.
		const deps = makeDeps({
			unresolved: {
				"notes/source-a.md": { "TargetA": 1 },
				"notes/source-b.md": { "TargetB": 1 },
			},
			grouping: "source",
			activeFilter: "TargetA",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		// source-a groups around TargetA and should appear; source-b only has TargetB
		const sourceAGroup = container.querySelector("[data-source='notes/source-a.md']");
		const sourceBGroup = container.querySelector("[data-source='notes/source-b.md']");
		expect(sourceAGroup).not.toBeNull();
		expect(sourceBGroup).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// No innerHTML / XSS safety
// ---------------------------------------------------------------------------

describe("DanglingPanel XSS safety", () => {
	it("renders XSS-like target names as text, not markup", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/a.md": { "<script>alert('xss')</script>": 1 },
			},
			grouping: "target",
		});
		const panel = new DanglingPanel(deps);
		const container = makeContainer();
		panel.render(container);

		// The script tag should not be executable — text content contains the literal string
		const scriptTags = container.querySelectorAll("script");
		expect(scriptTags.length).toBe(0);

		const headers = container.querySelectorAll(".orbit-dangling-group-header");
		const found = Array.from(headers).some((h) =>
			h.textContent?.includes("<script>"),
		);
		expect(found).toBe(true);
	});
});
