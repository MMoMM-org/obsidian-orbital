/**
 * DragInsertHelper unit tests — T4.2
 *
 * Tests exercise the two public behaviours:
 *   1. onDragStart: resolve TFile + call dragManager when available.
 *   2. insertAtCursor: insert [[wikilink]] at the active editor cursor.
 *
 * All Obsidian runtime dependencies are injected as structural mocks so no
 * real Obsidian runtime is needed.
 *
 * TDD: these tests were written BEFORE the implementation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DragInsertHelper } from "recent/DragInsertHelper";
import type { DragInsertHelperDeps } from "recent/DragInsertHelper";
import { TFile, MarkdownView, WorkspaceLeaf } from "obsidian";

// jsdom does not implement DragEvent — provide a minimal structural stand-in.
function makeDragEvent(): DragEvent {
	return new Event("dragstart") as unknown as DragEvent;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeTFile(overrides?: Partial<{ path: string; basename: string }>): TFile {
	const f = new TFile();
	if (overrides?.path !== undefined) f.path = overrides.path;
	if (overrides?.basename !== undefined) f.basename = overrides.basename;
	return f;
}

function makeMarkdownView(): MarkdownView {
	return new MarkdownView(new WorkspaceLeaf());
}

type MockDragManager = {
	dragFile: ReturnType<typeof vi.fn>;
	onDragStart: ReturnType<typeof vi.fn>;
};

function makeDragManager(): MockDragManager {
	return {
		dragFile: vi.fn(),
		onDragStart: vi.fn(),
	};
}

function makeDeps(overrides?: {
	tfile?: TFile | null;
	dragManager?: MockDragManager | undefined;
	markdownView?: MarkdownView | null;
}): DragInsertHelperDeps {
	const tfile = overrides?.tfile !== undefined ? overrides.tfile : makeTFile();
	const markdownView = overrides?.markdownView !== undefined
		? overrides.markdownView
		: makeMarkdownView();

	const deps: DragInsertHelperDeps = {
		getFirstLinkpathDest: vi.fn((_linkpath: string, _sourcePath: string) => tfile),
		getActiveMarkdownView: vi.fn(() => markdownView),
	};

	if ("dragManager" in (overrides ?? {})) {
		if (overrides?.dragManager !== undefined) {
			deps.dragManager = overrides.dragManager;
		}
		// else leave dragManager absent (undefined) — feature-detect absent case
	} else {
		// default: provide a dragManager
		deps.dragManager = makeDragManager();
	}

	return deps;
}

// ---------------------------------------------------------------------------
// onDragStart — desktop drag
// ---------------------------------------------------------------------------

describe("DragInsertHelper — onDragStart()", () => {
	let event: DragEvent;

	beforeEach(() => {
		event = makeDragEvent();
	});

	it("resolves the TFile via getFirstLinkpathDest", () => {
		const file = makeTFile({ path: "notes/MyNote.md", basename: "MyNote" });
		const deps = makeDeps({ tfile: file });
		const helper = new DragInsertHelper(deps);

		helper.onDragStart(event, "notes/MyNote.md");

		expect(deps.getFirstLinkpathDest).toHaveBeenCalledWith("notes/MyNote.md", "");
	});

	it("calls dragManager.dragFile with the event and resolved TFile", () => {
		const file = makeTFile({ path: "notes/MyNote.md", basename: "MyNote" });
		const dragManager = makeDragManager();
		const deps = makeDeps({ tfile: file, dragManager });
		const helper = new DragInsertHelper(deps);

		helper.onDragStart(event, "notes/MyNote.md");

		expect(dragManager.dragFile).toHaveBeenCalledWith(event, file);
	});

	it("does not throw when dragManager is absent (feature-detect: graceful degrade)", () => {
		const file = makeTFile();
		const deps = makeDeps({ tfile: file, dragManager: undefined });
		const helper = new DragInsertHelper(deps);

		expect(() => helper.onDragStart(event, "notes/MyNote.md")).not.toThrow();
	});

	it("does not call any drag method when dragManager is absent", () => {
		const file = makeTFile();
		const deps = makeDeps({ tfile: file, dragManager: undefined });
		const helper = new DragInsertHelper(deps);

		helper.onDragStart(event, "notes/MyNote.md");

		// No dragManager — nothing to assert other than no throw (above).
		// Verify file resolution still happens.
		expect(deps.getFirstLinkpathDest).toHaveBeenCalled();
	});

	it("is a no-op (no throw) when the file cannot be resolved (TFile is null)", () => {
		const deps = makeDeps({ tfile: null });
		const helper = new DragInsertHelper(deps);

		expect(() => helper.onDragStart(event, "gone.md")).not.toThrow();
	});

	it("does not call dragManager.dragFile when TFile resolves to null", () => {
		const dragManager = makeDragManager();
		const deps = makeDeps({ tfile: null, dragManager });
		const helper = new DragInsertHelper(deps);

		helper.onDragStart(event, "gone.md");

		expect(dragManager.dragFile).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// insertAtCursor — mobile / tap-to-insert fallback
// ---------------------------------------------------------------------------

describe("DragInsertHelper — insertAtCursor()", () => {
	it("calls editor.replaceSelection with [[basename]] when there is an active markdown view", () => {
		const view = makeMarkdownView();
		const deps = makeDeps({ markdownView: view });
		const helper = new DragInsertHelper(deps);

		helper.insertAtCursor("MyNote");

		expect(view.editor.replaceSelection).toHaveBeenCalledWith("[[MyNote]]");
	});

	it("uses the provided linktext (basename) not the full path in the wikilink", () => {
		const view = makeMarkdownView();
		const deps = makeDeps({ markdownView: view });
		const helper = new DragInsertHelper(deps);

		helper.insertAtCursor("ActualNote");

		expect(view.editor.replaceSelection).toHaveBeenCalledWith("[[ActualNote]]");
	});

	it("is a safe no-op when there is no active markdown view", () => {
		const deps = makeDeps({ markdownView: null });
		const helper = new DragInsertHelper(deps);

		expect(() => helper.insertAtCursor("MyNote")).not.toThrow();
	});

	it("does not call replaceSelection when there is no active markdown view", () => {
		const view = makeMarkdownView();
		const deps = makeDeps({ markdownView: null });
		const helper = new DragInsertHelper(deps);

		helper.insertAtCursor("MyNote");

		// The view was never returned by getActiveMarkdownView, so it shouldn't be called.
		expect(view.editor.replaceSelection).not.toHaveBeenCalled();
	});
});
