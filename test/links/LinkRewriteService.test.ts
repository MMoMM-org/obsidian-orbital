/**
 * LinkRewriteService — T3.2
 *
 * TDD: tests written BEFORE implementation (RED phase).
 * Tests exercise observable behaviour through the public API only.
 *
 * Coverage:
 *   - previewRename: returns occurrences/files from index (scoped)
 *   - applyRename (dangling target): offset-splice descending, part preservation
 *   - applyRename (real note path): merge path via renameFile/generateMarkdownLink
 *   - applyAlias: rewrites to [[note|orig]] for chosen existing note
 *   - applyDelete: removes links; onlyInActiveNote filter; frontmatter via processFrontMatter
 *   - Frontmatter links rewritten via processFrontMatter, not body splice
 *   - Per-file failures accumulate; batch continues
 *   - Sequential execution (never parallel)
 *   - Counts re-resolved before applying
 *   - Multi-link-per-file ordering (descending offset)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import { LinkRewriteService } from "links/LinkRewriteService";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeIndex(app: App): LinkGraphIndex {
	return new LinkGraphIndex(app.metadataCache);
}

/**
 * Wires up app.metadataCache.unresolvedLinks so that LinkGraphIndex.buildFull()
 * registers the given dangling target as appearing `count` times in `sourcePath`.
 */
function seedDangling(
	app: App,
	index: LinkGraphIndex,
	sourcePath: string,
	target: string,
	count: number,
): void {
	app.metadataCache.unresolvedLinks[sourcePath] = {
		...(app.metadataCache.unresolvedLinks[sourcePath] ?? {}),
		[target]: count,
	};
	index.buildFull();
}

/**
 * Build a CachedMetadata-like object with links at given positions.
 * The position offsets are inside the content string.
 */
function makeCacheWithLinks(
	links: Array<{ start: number; end: number }>,
): { links: Array<{ position: { start: { offset: number }; end: { offset: number } } }> } {
	return {
		links: links.map(({ start, end }) => ({
			position: { start: { offset: start }, end: { offset: end } },
		})),
	};
}

function makeCacheWithEmbeds(
	embeds: Array<{ start: number; end: number }>,
): { embeds: Array<{ position: { start: { offset: number }; end: { offset: number } } }> } {
	return {
		embeds: embeds.map(({ start, end }) => ({
			position: { start: { offset: start }, end: { offset: end } },
		})),
	};
}

// ---------------------------------------------------------------------------
// previewRename
// ---------------------------------------------------------------------------

describe("previewRename", () => {
	it("returns zero occurrences when target is unknown", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		index.buildFull();
		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);

		const result = await svc.previewRename("UnknownNote", {});
		expect(result.occurrences).toBe(0);
		expect(result.files).toEqual([]);
	});

	it("returns correct occurrences from the index for a dangling target", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		seedDangling(app, index, "notes/A.md", "Foo", 3);
		seedDangling(app, index, "notes/B.md", "Foo", 1);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.previewRename("Foo", {});

		expect(result.occurrences).toBe(4);
		expect(result.files).toHaveLength(2);
		const paths = result.files.map((f) => f.path).sort();
		expect(paths).toEqual(["notes/A.md", "notes/B.md"]);
		expect(result.files.find((f) => f.path === "notes/A.md")?.count).toBe(3);
		expect(result.files.find((f) => f.path === "notes/B.md")?.count).toBe(1);
	});

	it("filters by scope.folder", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		seedDangling(app, index, "folder/X.md", "Bar", 2);
		seedDangling(app, index, "other/Y.md", "Bar", 5);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.previewRename("Bar", { folder: "folder" });

		expect(result.occurrences).toBe(2);
		expect(result.files).toHaveLength(1);
		const firstFile = result.files[0];
		expect(firstFile).toBeDefined();
		expect(firstFile?.path).toBe("folder/X.md");
	});

	it("is case-insensitive (matches the index key exactly)", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		// Index stores the target text exactly as it appears in the unresolved links
		seedDangling(app, index, "notes/A.md", "myNote", 2);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		// danglingFor uses exact match on the index key
		const result = await svc.previewRename("myNote", {});
		expect(result.occurrences).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// applyRename — dangling path (offset-splice)
// ---------------------------------------------------------------------------

describe("applyRename — dangling target (offset-splice)", () => {
	it("calls vault.process for each source file and rewrites link text", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const sourceFile = createMockTFile({ path: "notes/A.md" });

		seedDangling(app, index, "notes/A.md", "OldName", 1);

		// vault.getAbstractFileByPath returns null — not a real note
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		// getFirstLinkpathDest returns null — OldName is dangling
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		// vault.getFileByPath returns the TFile for the source
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) =>
			path === "notes/A.md" ? sourceFile : null,
		);

		const content = "See [[OldName]] for reference.";
		// links: [[OldName]] is at offset 4..15
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 4, end: 15 }]),
		);

		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => transform(content),
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.applyRename("OldName", "NewName", {});

		expect(vi.mocked(app.vault.process)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(app.vault.process)).toHaveBeenCalledWith(sourceFile, expect.any(Function));
		expect(result.filesSucceeded).toBe(1);
		expect(result.filesFailed).toEqual([]);
	});

	it("preserves subpath, alias, and embed when renaming", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const sourceFile = createMockTFile({ path: "notes/A.md" });

		seedDangling(app, index, "notes/A.md", "OldName", 2);

		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) =>
			path === "notes/A.md" ? sourceFile : null,
		);

		// Two links: one with subpath+alias, one embed — both match OldName
		const content = "[[OldName#h|A]] and ![[OldName|cap]]";
		// [[OldName#h|A]] at 0..15, ![[OldName|cap]] at 20..36
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			...makeCacheWithLinks([{ start: 0, end: 15 }]),
			...makeCacheWithEmbeds([{ start: 20, end: 36 }]),
		});

		let capturedResult = "";
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => {
				capturedResult = transform(content);
				return capturedResult;
			},
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		await svc.applyRename("OldName", "NewName", {});

		// Both links rewritten; alias/subpath/embed preserved
		expect(capturedResult).toBe("[[NewName#h|A]] and ![[NewName|cap]]");
	});

	it("applies multiple links per file in descending offset order", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const sourceFile = createMockTFile({ path: "notes/A.md" });

		// Three occurrences in the same file
		app.metadataCache.unresolvedLinks["notes/A.md"] = { Foo: 3 };
		index.buildFull();

		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) =>
			path === "notes/A.md" ? sourceFile : null,
		);

		// Content has three [[Foo]] links
		const content = "[[Foo]] then [[Foo]] then [[Foo]] end";
		// offsets: 0..7, 13..20, 26..33
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([
				{ start: 0, end: 7 },
				{ start: 13, end: 20 },
				{ start: 26, end: 33 },
			]),
		);

		let capturedResult = "";
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => {
				capturedResult = transform(content);
				return capturedResult;
			},
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		await svc.applyRename("Foo", "Bar", {});

		expect(capturedResult).toBe("[[Bar]] then [[Bar]] then [[Bar]] end");
	});
});

// ---------------------------------------------------------------------------
// applyRename — real note path (merge path)
// ---------------------------------------------------------------------------

describe("applyRename — real note target (merge path)", () => {
	it("routes via fileManager.renameFile when newName resolves to an existing note", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const sourceFile = createMockTFile({ path: "notes/A.md" });
		const realNote = createMockTFile({ path: "notes/RealNote.md" });

		seedDangling(app, index, "notes/A.md", "OldName", 1);

		// getAbstractFileByPath → real note exists
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) =>
			path === "notes/RealNote.md" ? realNote : null,
		);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) =>
			path === "notes/A.md" ? sourceFile : null,
		);

		vi.mocked(app.fileManager.renameFile).mockResolvedValue(undefined);
		vi.mocked(app.fileManager.generateMarkdownLink).mockReturnValue("[[RealNote]]");

		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => transform("[[OldName]]"),
		);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 0, end: 11 }]),
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.applyRename("OldName", "notes/RealNote.md", {});

		// Should use vault.process with generated link text, not rename the vault file
		// (merge path: rewrite links in source files using generateMarkdownLink)
		expect(vi.mocked(app.fileManager.generateMarkdownLink)).toHaveBeenCalled();
		expect(result.filesSucceeded).toBe(1);
		expect(result.filesFailed).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// applyAlias
// ---------------------------------------------------------------------------

describe("applyAlias", () => {
	it("rewrites [[Target]] to [[RealNote|Target]] in source files", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const sourceFile = createMockTFile({ path: "notes/A.md" });
		const realNote = createMockTFile({ path: "notes/Real.md" });

		seedDangling(app, index, "notes/A.md", "Target", 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) =>
			path === "notes/Real.md" ? realNote : null,
		);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) =>
			path === "notes/A.md" ? sourceFile : null,
		);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(realNote);

		const content = "See [[Target]] here.";
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 4, end: 14 }]),
		);

		let capturedResult = "";
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => {
				capturedResult = transform(content);
				return capturedResult;
			},
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.applyAlias("Target", "notes/Real.md", {});

		// [[Target]] → [[Real|Target]]  (realNote basename = "Real" from path)
		expect(capturedResult).toBe("See [[Real|Target]] here.");
		expect(result.filesSucceeded).toBe(1);
		expect(result.filesFailed).toEqual([]);
	});

	it("preserves existing alias when present: [[Target|Existing]] → [[Real|Existing]]", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const sourceFile = createMockTFile({ path: "notes/A.md" });
		const realNote = createMockTFile({ path: "notes/Real.md" });

		seedDangling(app, index, "notes/A.md", "Target", 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) =>
			path === "notes/Real.md" ? realNote : null,
		);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) =>
			path === "notes/A.md" ? sourceFile : null,
		);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(realNote);

		const content = "[[Target|Existing]]";
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 0, end: 19 }]),
		);

		let capturedResult = "";
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => {
				capturedResult = transform(content);
				return capturedResult;
			},
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		await svc.applyAlias("Target", "notes/Real.md", {});

		expect(capturedResult).toBe("[[Real|Existing]]");
	});
});

// ---------------------------------------------------------------------------
// applyDelete
// ---------------------------------------------------------------------------

describe("applyDelete", () => {
	it("removes links in all source files (replaces with plain text)", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const sourceFile = createMockTFile({ path: "notes/A.md" });

		seedDangling(app, index, "notes/A.md", "Gone", 1);

		vi.mocked(app.vault.getFileByPath).mockImplementation((path) =>
			path === "notes/A.md" ? sourceFile : null,
		);

		const content = "Read [[Gone]] here.";
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 5, end: 13 }]),
		);

		let capturedResult = "";
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => {
				capturedResult = transform(content);
				return capturedResult;
			},
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.applyDelete("Gone", {}, false);

		// [[Gone]] → "Gone" (removeLink uses target when no alias)
		expect(capturedResult).toBe("Read Gone here.");
		expect(result.filesSucceeded).toBe(1);
		expect(result.filesFailed).toEqual([]);
	});

	it("onlyInActiveNote=true restricts to active file path", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const fileA = createMockTFile({ path: "notes/A.md" });
		const fileB = createMockTFile({ path: "notes/B.md" });

		// Two files have the dangling link
		app.metadataCache.unresolvedLinks["notes/A.md"] = { Gone: 1 };
		app.metadataCache.unresolvedLinks["notes/B.md"] = { Gone: 1 };
		index.buildFull();

		// Active file is B.md
		vi.mocked(app.workspace.getActiveFile).mockReturnValue(fileB);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) => {
			if (path === "notes/A.md") return fileA;
			if (path === "notes/B.md") return fileB;
			return null;
		});

		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 0, end: 8 }]),
		);
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => transform("[[Gone]]"),
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.applyDelete("Gone", {}, true);

		// Only B.md should be processed
		expect(vi.mocked(app.vault.process)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(app.vault.process)).toHaveBeenCalledWith(fileB, expect.any(Function));
		expect(result.filesSucceeded).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Frontmatter links
// ---------------------------------------------------------------------------

describe("frontmatter link rewriting", () => {
	it("calls processFrontMatter for files with frontmatterLinks", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const sourceFile = createMockTFile({ path: "notes/A.md" });

		seedDangling(app, index, "notes/A.md", "OldFM", 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) =>
			path === "notes/A.md" ? sourceFile : null,
		);

		// Cache has frontmatterLinks but no body links
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatterLinks: [
				{
					key: "related",
					link: "OldFM",
					original: "[[OldFM]]",
					displayText: "OldFM",
					position: { start: { offset: 10 }, end: { offset: 19 } },
				},
			],
		});

		// vault.process still called (may have no body links to splice, returns data unchanged)
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) =>
				transform("---\nrelated: '[[OldFM]]'\n---\n"),
		);
		vi.mocked(app.fileManager.processFrontMatter).mockImplementation(
			async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				fn({ related: "[[OldFM]]" });
			},
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		await svc.applyRename("OldFM", "NewFM", {});

		expect(vi.mocked(app.fileManager.processFrontMatter)).toHaveBeenCalledWith(
			sourceFile,
			expect.any(Function),
		);
	});

	it("does NOT call processFrontMatter when no frontmatterLinks in cache", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const sourceFile = createMockTFile({ path: "notes/A.md" });

		seedDangling(app, index, "notes/A.md", "BodyOnly", 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) =>
			path === "notes/A.md" ? sourceFile : null,
		);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 0, end: 12 }]),
		);
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) =>
				transform("[[BodyOnly]]"),
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		await svc.applyRename("BodyOnly", "NewName", {});

		expect(vi.mocked(app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Per-file failure accumulation
// ---------------------------------------------------------------------------

describe("BulkResult — partial failure handling", () => {
	it("accumulates failures and continues processing remaining files", async () => {
		const app = makeApp();
		const index = makeIndex(app);
		const fileA = createMockTFile({ path: "notes/A.md" });
		const fileB = createMockTFile({ path: "notes/B.md" });

		app.metadataCache.unresolvedLinks["notes/A.md"] = { Broken: 1 };
		app.metadataCache.unresolvedLinks["notes/B.md"] = { Broken: 1 };
		index.buildFull();

		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) => {
			if (path === "notes/A.md") return fileA;
			if (path === "notes/B.md") return fileB;
			return null;
		});

		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 0, end: 10 }]),
		);

		let callCount = 0;
		vi.mocked(app.vault.process).mockImplementation(async (file: TFile, transform: (data: string) => string) => {
			callCount++;
			// First call fails, second succeeds
			if (file.path === "notes/A.md") {
				throw new Error("disk error");
			}
			return transform("[[Broken]]");
		});

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.applyRename("Broken", "Fixed", {});

		expect(result.filesSucceeded).toBe(1);
		expect(result.filesFailed).toHaveLength(1);
		const failedA = result.filesFailed[0];
		expect(failedA).toBeDefined();
		expect(failedA?.path).toBe("notes/A.md");
		expect(failedA?.error).toContain("disk error");
		// Both files attempted (batch continued after failure)
		expect(callCount).toBe(2);
	});

	it("reports failed file when vault.getFileByPath returns null", async () => {
		const app = makeApp();
		const index = makeIndex(app);

		seedDangling(app, index, "notes/Missing.md", "Target", 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		// Source file not found in vault
		vi.mocked(app.vault.getFileByPath).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 0, end: 10 }]),
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.applyRename("Target", "NewTarget", {});

		expect(result.filesSucceeded).toBe(0);
		expect(result.filesFailed).toHaveLength(1);
		const failedMissing = result.filesFailed[0];
		expect(failedMissing).toBeDefined();
		expect(failedMissing?.path).toBe("notes/Missing.md");
	});
});

// ---------------------------------------------------------------------------
// Sequential execution
// ---------------------------------------------------------------------------

describe("sequential execution", () => {
	it("processes files one at a time (sequential, never parallel)", async () => {
		const app = makeApp();
		const index = makeIndex(app);

		// Three source files
		const paths = ["notes/A.md", "notes/B.md", "notes/C.md"];
		for (const p of paths) {
			app.metadataCache.unresolvedLinks[p] = { Seq: 1 };
		}
		index.buildFull();

		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) => {
			const f = createMockTFile({ path });
			return f;
		});
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 0, end: 7 }]),
		);

		const callOrder: string[] = [];
		vi.mocked(app.vault.process).mockImplementation(
			async (file: TFile, transform: (data: string) => string) => {
				callOrder.push(file.path);
				return transform("[[Seq]]");
			},
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		await svc.applyRename("Seq", "Done", {});

		// All three files processed
		expect(callOrder).toHaveLength(3);
		// Order matches the iteration order (no interleaving)
		expect(new Set(callOrder)).toEqual(new Set(paths));
	});
});

// ---------------------------------------------------------------------------
// Counts re-resolved before applying
// ---------------------------------------------------------------------------

describe("counts re-resolved before applying", () => {
	it("re-reads the index at apply time, not just at preview time", async () => {
		const app = makeApp();
		const index = makeIndex(app);

		// Start with one file
		seedDangling(app, index, "notes/A.md", "Stale", 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		vi.mocked(app.vault.getFileByPath).mockImplementation((path) => {
			if (path === "notes/A.md") return createMockTFile({ path: "notes/A.md" });
			if (path === "notes/B.md") return createMockTFile({ path: "notes/B.md" });
			return null;
		});
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 0, end: 9 }]),
		);
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => transform("[[Stale]]"),
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);

		// Preview at T1: 1 file
		const preview = await svc.previewRename("Stale", {});
		expect(preview.occurrences).toBe(1);

		// Between preview and apply, another file appears
		app.metadataCache.unresolvedLinks["notes/B.md"] = { Stale: 2 };
		index.buildFull();

		// Apply should see BOTH files (re-resolved)
		const result = await svc.applyRename("Stale", "Fresh", {});
		expect(result.filesSucceeded).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// applyDelete — scope filter
// ---------------------------------------------------------------------------

describe("applyDelete — scope folder filter", () => {
	it("restricts deletion to files under the given folder", async () => {
		const app = makeApp();
		const index = makeIndex(app);

		app.metadataCache.unresolvedLinks["folder/A.md"] = { Gone: 1 };
		app.metadataCache.unresolvedLinks["other/B.md"] = { Gone: 1 };
		index.buildFull();

		vi.mocked(app.vault.getFileByPath).mockImplementation((path) => {
			if (path === "folder/A.md") return createMockTFile({ path: "folder/A.md" });
			if (path === "other/B.md") return createMockTFile({ path: "other/B.md" });
			return null;
		});
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			makeCacheWithLinks([{ start: 0, end: 8 }]),
		);
		vi.mocked(app.vault.process).mockImplementation(
			async (_file: TFile, transform: (data: string) => string) => transform("[[Gone]]"),
		);

		const svc = new LinkRewriteService(app.vault, app.fileManager, app.metadataCache, index, app.workspace);
		const result = await svc.applyDelete("Gone", { folder: "folder" }, false);

		expect(result.filesSucceeded).toBe(1);
		expect(vi.mocked(app.vault.process)).toHaveBeenCalledTimes(1);
		const firstCall = vi.mocked(app.vault.process).mock.calls[0];
		expect(firstCall).toBeDefined();
		const calledFile = firstCall?.[0] as TFile;
		expect(calledFile.path).toBe("folder/A.md");
	});
});
