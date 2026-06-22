/**
 * LinkGraphIndex unit tests — T2.1
 *
 * Tests exercise the public API only. The mock metadataCache's resolvedLinks
 * and unresolvedLinks maps are set directly on the instance so each test
 * controls vault state precisely without touching the real Obsidian runtime.
 *
 * TDD: these tests were written BEFORE the implementation.
 */

import { describe, it, expect } from "vitest";
import { App } from "obsidian";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { MetadataCache } from "graph/LinkGraphIndex";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCache(
	resolved: Record<string, Record<string, number>> = {},
	unresolved: Record<string, Record<string, number>> = {},
): MetadataCache {
	const app = new App();
	app.metadataCache.resolvedLinks = resolved;
	app.metadataCache.unresolvedLinks = unresolved;
	return app.metadataCache as unknown as MetadataCache;
}

// ---------------------------------------------------------------------------
// buildFull
// ---------------------------------------------------------------------------

describe("LinkGraphIndex.buildFull", () => {
	it("populates outgoingOf from resolvedLinks", () => {
		const cache = makeMockCache({
			"a.md": { "b.md": 1, "c.md": 2 },
		});
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		expect(idx.outgoingOf("a.md")).toEqual(expect.arrayContaining(["b.md", "c.md"]));
		expect(idx.outgoingOf("a.md")).toHaveLength(2);
	});

	it("populates backlinksOf (reverse index) from resolvedLinks", () => {
		const cache = makeMockCache({
			"a.md": { "b.md": 1 },
			"c.md": { "b.md": 1 },
		});
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		expect(idx.backlinksOf("b.md")).toEqual(expect.arrayContaining(["a.md", "c.md"]));
		expect(idx.backlinksOf("b.md")).toHaveLength(2);
	});

	it("populates danglingTargets from unresolvedLinks", () => {
		const cache = makeMockCache(
			{},
			{ "a.md": { "Missing Note": 2 } },
		);
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		const dangling = idx.danglingTargets({});
		expect(dangling).toHaveLength(1);
		expect(dangling[0]!.target).toBe("Missing Note");
		expect(dangling[0]!.totalCount).toBe(2);
		expect(dangling[0]!.occurrences).toEqual([{ sourcePath: "a.md", count: 2 }]);
	});

	it("returns [] for unknown paths without throwing", () => {
		const cache = makeMockCache();
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		expect(idx.outgoingOf("nonexistent.md")).toEqual([]);
		expect(idx.backlinksOf("nonexistent.md")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// backlinksOf / outgoingOf guard (no crash for unknown)
// ---------------------------------------------------------------------------

describe("LinkGraphIndex — safe lookups before buildFull", () => {
	it("backlinksOf returns [] before buildFull is called", () => {
		const cache = makeMockCache();
		const idx = new LinkGraphIndex(cache);
		expect(idx.backlinksOf("any.md")).toEqual([]);
	});

	it("outgoingOf returns [] before buildFull is called", () => {
		const cache = makeMockCache();
		const idx = new LinkGraphIndex(cache);
		expect(idx.outgoingOf("any.md")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// removeFile
// ---------------------------------------------------------------------------

describe("LinkGraphIndex.removeFile", () => {
	it("drops all forward edges for removed file", () => {
		const cache = makeMockCache({ "a.md": { "b.md": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();
		idx.removeFile("a.md");

		expect(idx.outgoingOf("a.md")).toEqual([]);
	});

	it("drops reverse edges pointing to removed source", () => {
		const cache = makeMockCache({ "a.md": { "b.md": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();
		idx.removeFile("a.md");

		expect(idx.backlinksOf("b.md")).toEqual([]);
	});

	it("removes unresolved entries for removed file", () => {
		const cache = makeMockCache({}, { "a.md": { "Missing": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();
		idx.removeFile("a.md");

		expect(idx.danglingTargets({})).toEqual([]);
	});

	it("is safe to call for unknown file", () => {
		const cache = makeMockCache();
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();
		expect(() => idx.removeFile("ghost.md")).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// updateFile — incremental O(degree) updates
// ---------------------------------------------------------------------------

describe("LinkGraphIndex.updateFile", () => {
	it("removes stale reverse edges when outgoing links change", () => {
		// a.md initially links to b.md; after update it links to c.md only
		const cache = makeMockCache({ "a.md": { "b.md": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		// Mutate cache to reflect new vault state
		cache.resolvedLinks["a.md"] = { "c.md": 1 };
		idx.updateFile("a.md");

		expect(idx.backlinksOf("b.md")).toEqual([]);
		expect(idx.backlinksOf("c.md")).toEqual(["a.md"]);
		expect(idx.outgoingOf("a.md")).toEqual(["c.md"]);
	});

	it("adds new reverse edges for newly added outgoing links", () => {
		const cache = makeMockCache({ "a.md": { "b.md": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		cache.resolvedLinks["a.md"] = { "b.md": 1, "c.md": 1 };
		idx.updateFile("a.md");

		expect(idx.backlinksOf("c.md")).toEqual(["a.md"]);
		expect(idx.outgoingOf("a.md")).toEqual(expect.arrayContaining(["b.md", "c.md"]));
	});

	it("updates unresolved entries for the file", () => {
		const cache = makeMockCache({}, { "a.md": { "OldMissing": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		cache.unresolvedLinks["a.md"] = { "NewMissing": 3 };
		idx.updateFile("a.md");

		const dangling = idx.danglingTargets({});
		expect(dangling.find((d) => d.target === "OldMissing")).toBeUndefined();
		expect(dangling.find((d) => d.target === "NewMissing")?.totalCount).toBe(3);
	});

	it("is safe to call for file not previously in index", () => {
		const cache = makeMockCache({ "a.md": { "b.md": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		cache.resolvedLinks["new.md"] = { "b.md": 1 };
		expect(() => idx.updateFile("new.md")).not.toThrow();
		expect(idx.backlinksOf("b.md")).toEqual(expect.arrayContaining(["a.md", "new.md"]));
	});

	it("removes forwardIndex entry when all links are cleared", () => {
		const cache = makeMockCache({
			"a.md": { "b.md": 1 },
			"c.md": { "b.md": 1 },
		});
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		// Clear all outgoing links from a.md
		cache.resolvedLinks["a.md"] = {};
		idx.updateFile("a.md");

		// a.md should have no outgoing links
		expect(idx.outgoingOf("a.md")).toEqual([]);

		// b.md's backlinks should no longer include a.md
		expect(idx.backlinksOf("b.md")).toEqual(["c.md"]);

		// State should match a fresh buildFull on the same final cache
		const fresh = new LinkGraphIndex(cache);
		fresh.buildFull();

		expect(idx.outgoingOf("a.md").sort()).toEqual(fresh.outgoingOf("a.md").sort());
		expect(idx.outgoingOf("c.md").sort()).toEqual(fresh.outgoingOf("c.md").sort());
		expect(idx.backlinksOf("b.md").sort()).toEqual(fresh.backlinksOf("b.md").sort());
		expect(idx.backlinksOf("a.md").sort()).toEqual(fresh.backlinksOf("a.md").sort());
	});
});

// ---------------------------------------------------------------------------
// renameFile
// ---------------------------------------------------------------------------

describe("LinkGraphIndex.renameFile", () => {
	it("retargets forward index: old key removed, new key added", () => {
		const cache = makeMockCache({ "a.md": { "b.md": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		idx.renameFile("a.md", "a-renamed.md");

		expect(idx.outgoingOf("a.md")).toEqual([]);
		expect(idx.outgoingOf("a-renamed.md")).toEqual(["b.md"]);
	});

	it("retargets reverse index: old source removed, new source added", () => {
		const cache = makeMockCache({ "a.md": { "b.md": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		idx.renameFile("a.md", "a-renamed.md");

		expect(idx.backlinksOf("b.md")).toEqual(["a-renamed.md"]);
	});

	it("retargets dest key in reverse index when a destination is renamed", () => {
		const cache = makeMockCache({ "a.md": { "b.md": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		// b.md is renamed to b-renamed.md
		idx.renameFile("b.md", "b-renamed.md");

		expect(idx.backlinksOf("b.md")).toEqual([]);
		expect(idx.backlinksOf("b-renamed.md")).toEqual(["a.md"]);
		expect(idx.outgoingOf("a.md")).toEqual(["b-renamed.md"]);
	});

	it("is safe to call for unknown file", () => {
		const cache = makeMockCache();
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();
		expect(() => idx.renameFile("ghost.md", "ghost2.md")).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// danglingTargets — aggregation + folder filter
// ---------------------------------------------------------------------------

describe("LinkGraphIndex.danglingTargets", () => {
	it("aggregates occurrences from multiple sources for the same target", () => {
		const cache = makeMockCache(
			{},
			{
				"a.md": { "SharedMissing": 2 },
				"b.md": { "SharedMissing": 1 },
			},
		);
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		const dangling = idx.danglingTargets({});
		const entry = dangling.find((d) => d.target === "SharedMissing");
		expect(entry).toBeDefined();
		expect(entry!.totalCount).toBe(3);
		expect(entry!.occurrences).toHaveLength(2);
	});

	it("filters by folder prefix when scope.folder is given", () => {
		const cache = makeMockCache(
			{},
			{
				"folder/note.md": { "FolderMissing": 1 },
				"other/note.md": { "OtherMissing": 1 },
			},
		);
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		const dangling = idx.danglingTargets({ folder: "folder" });
		expect(dangling.find((d) => d.target === "FolderMissing")).toBeDefined();
		expect(dangling.find((d) => d.target === "OtherMissing")).toBeUndefined();
	});

	it("returns empty array when no dangling links exist", () => {
		const cache = makeMockCache({ "a.md": { "b.md": 1 } }, {});
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		expect(idx.danglingTargets({})).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// danglingFor
// ---------------------------------------------------------------------------

describe("LinkGraphIndex.danglingFor", () => {
	it("returns the DanglingTarget entry for a known target", () => {
		const cache = makeMockCache({}, { "a.md": { "Missing": 1 } });
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		const entry = idx.danglingFor("Missing");
		expect(entry).not.toBeNull();
		expect(entry!.target).toBe("Missing");
		expect(entry!.totalCount).toBe(1);
	});

	it("returns null for an unknown target", () => {
		const cache = makeMockCache();
		const idx = new LinkGraphIndex(cache);
		idx.buildFull();

		expect(idx.danglingFor("DoesNotExist")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Incremental == full invariant
// ---------------------------------------------------------------------------

describe("LinkGraphIndex — incremental update equals full rebuild", () => {
	it("sequence of updateFile/removeFile/renameFile matches a fresh buildFull", () => {
		// Initial state
		const resolved: Record<string, Record<string, number>> = {
			"a.md": { "b.md": 1 },
			"c.md": { "b.md": 1, "d.md": 1 },
		};
		const unresolved: Record<string, Record<string, number>> = {
			"a.md": { "Ghost": 1 },
		};
		const cache = makeMockCache(resolved, unresolved);

		// Build incremental index and apply operations
		const incremental = new LinkGraphIndex(cache);
		incremental.buildFull();

		// op1: add new file e.md → b.md
		resolved["e.md"] = { "b.md": 1 };
		incremental.updateFile("e.md");

		// op2: a.md changes links: b.md removed, d.md added; unresolved cleared
		resolved["a.md"] = { "d.md": 1 };
		delete unresolved["a.md"];
		incremental.updateFile("a.md");

		// op3: remove c.md entirely
		delete resolved["c.md"];
		delete unresolved["c.md"];
		incremental.removeFile("c.md");

		// op4: rename e.md → f.md
		resolved["f.md"] = resolved["e.md"]!;
		delete resolved["e.md"];
		incremental.renameFile("e.md", "f.md");

		// Now build a fresh index on the same final state
		const fresh = new LinkGraphIndex(cache);
		fresh.buildFull();

		// Compare all reachable nodes
		const allPaths = new Set([
			...Object.keys(resolved),
			...Object.values(resolved).flatMap((r) => Object.keys(r)),
		]);
		for (const p of allPaths) {
			expect(incremental.outgoingOf(p).sort()).toEqual(fresh.outgoingOf(p).sort());
			expect(incremental.backlinksOf(p).sort()).toEqual(fresh.backlinksOf(p).sort());
		}

		// Compare dangling targets
		const incDangling = incremental.danglingTargets({}).map((d) => d.target).sort();
		const freshDangling = fresh.danglingTargets({}).map((d) => d.target).sort();
		expect(incDangling).toEqual(freshDangling);
	});
});
