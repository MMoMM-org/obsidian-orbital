/**
 * Relations pure functions — T2.2
 *
 * Tests exercise computeRelations() through its observable outputs only.
 * The exclusion predicate is accepted as a plain (path: string) => boolean
 * so this module stays pure and testable without wiring real TFile/MetadataCache.
 *
 * TDD: these tests were written BEFORE the implementation.
 */

import { describe, it, expect } from "vitest";
import { App } from "obsidian";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { MetadataCache as IndexMetadataCache } from "graph/LinkGraphIndex";
import { computeRelations } from "graph/relations";
import type { RelationsMetadataCache } from "graph/relations";
import type { OrbitSettings } from "types/index";
import { DEFAULT_SETTINGS } from "types/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCache(
	resolved: Record<string, Record<string, number>> = {},
	unresolved: Record<string, Record<string, number>> = {},
): IndexMetadataCache {
	const app = new App();
	app.metadataCache.resolvedLinks = resolved;
	app.metadataCache.unresolvedLinks = unresolved;
	return app.metadataCache as unknown as IndexMetadataCache;
}

function makeRelationsCache(
	unresolved: Record<string, Record<string, number>> = {},
): RelationsMetadataCache {
	return { unresolvedLinks: unresolved };
}

function makeSettings(overrides?: Partial<OrbitSettings>): OrbitSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

/** Build an index from a resolved-links map and call buildFull(). */
function buildIndex(
	resolved: Record<string, Record<string, number>> = {},
	unresolved: Record<string, Record<string, number>> = {},
): LinkGraphIndex {
	const cache = makeMockCache(resolved, unresolved);
	const idx = new LinkGraphIndex(cache);
	idx.buildFull();
	return idx;
}

/** No-op exclusion: nothing is excluded. */
const noExclusion = (_path: string): boolean => false;

// ---------------------------------------------------------------------------
// outgoing and backlinks
// ---------------------------------------------------------------------------

describe("computeRelations — outgoing", () => {
	it("returns RelationItems for each resolved outgoing link", () => {
		const idx = buildIndex({ "active.md": { "notes/alpha.md": 1, "beta.md": 2 } });
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache(),
		);

		const paths = result.outgoing.map((r) => r.path);
		expect(paths).toContain("notes/alpha.md");
		expect(paths).toContain("beta.md");
		expect(result.outgoing).toHaveLength(2);
	});

	it("sets display to basename without extension", () => {
		const idx = buildIndex({ "active.md": { "folder/My Note.md": 1 } });
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.outgoing[0]).toEqual({ path: "folder/My Note.md", display: "My Note" });
	});

	it("returns empty outgoing for note with no links", () => {
		const idx = buildIndex({ "active.md": {} });
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.outgoing).toEqual([]);
	});
});

describe("computeRelations — backlinks", () => {
	it("returns RelationItems for each note linking TO the active note", () => {
		const idx = buildIndex({
			"referrer1.md": { "active.md": 1 },
			"referrer2.md": { "active.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache(),
		);

		const paths = result.backlinks.map((r) => r.path);
		expect(paths).toContain("referrer1.md");
		expect(paths).toContain("referrer2.md");
		expect(result.backlinks).toHaveLength(2);
	});

	it("sets display to basename without extension for backlinks", () => {
		const idx = buildIndex({ "folder/Referrer.md": { "active.md": 1 } });
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.backlinks[0]).toEqual({ path: "folder/Referrer.md", display: "Referrer" });
	});

	it("returns empty backlinks when nothing links to active note", () => {
		const idx = buildIndex({ "active.md": { "other.md": 1 } });
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.backlinks).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// secondHop — disabled path
// ---------------------------------------------------------------------------

describe("computeRelations — secondHopEnabled: false", () => {
	it("yields empty secondHop when secondHopEnabled is false", () => {
		const idx = buildIndex({
			"active.md": { "via.md": 1 },
			"via.md": { "second.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.secondHop).toEqual([]);
		expect(result.truncated).toBe(false);
	});

	it("yields empty secondHop when secondHopCap is 0 even if enabled", () => {
		const idx = buildIndex({
			"active.md": { "via.md": 1 },
			"via.md": { "second.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 0 }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.secondHop).toEqual([]);
		expect(result.truncated).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// secondHop — basic traversal
// ---------------------------------------------------------------------------

describe("computeRelations — secondHop traversal", () => {
	it("finds 2nd-hop notes via outgoing direction", () => {
		// active → via → second
		const idx = buildIndex({
			"active.md": { "via.md": 1 },
			"via.md": { "second.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 50 }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.secondHop).toHaveLength(1);
		expect(result.secondHop[0]!.via.path).toBe("via.md");
		expect(result.secondHop[0]!.items.map((i) => i.path)).toContain("second.md");
		expect(result.truncated).toBe(false);
	});

	it("finds 2nd-hop notes via backlink direction (both-direction traversal)", () => {
		// backlinker → via, active → via; so backlinker is a 2nd hop via `via`
		const idx = buildIndex({
			"active.md": { "via.md": 1 },
			"backlinker.md": { "via.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 50 }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.secondHop).toHaveLength(1);
		const groupPaths = result.secondHop[0]!.items.map((i) => i.path);
		expect(groupPaths).toContain("backlinker.md");
	});

	it("excludes active note from secondHop results", () => {
		// via links back to active — should not appear in 2nd hop
		const idx = buildIndex({
			"active.md": { "via.md": 1 },
			"via.md": { "active.md": 1, "other.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 50 }),
			noExclusion,
			makeRelationsCache(),
		);

		const allSecondHopPaths = result.secondHop.flatMap((g) => g.items.map((i) => i.path));
		expect(allSecondHopPaths).not.toContain("active.md");
	});

	it("excludes first-hop nodes from secondHop results (1st-hop exclusion)", () => {
		// active → via1 → via2 (but via2 is already a 1st hop via backlinks)
		const idx = buildIndex({
			"active.md": { "via1.md": 1, "via2.md": 1 },
			"via1.md": { "via2.md": 1, "second.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 50 }),
			noExclusion,
			makeRelationsCache(),
		);

		const allSecondHopPaths = result.secondHop.flatMap((g) => g.items.map((i) => i.path));
		expect(allSecondHopPaths).not.toContain("via2.md");
		expect(allSecondHopPaths).toContain("second.md");
	});
});

// ---------------------------------------------------------------------------
// secondHop — global deduplication
// ---------------------------------------------------------------------------

describe("computeRelations — secondHop global dedup", () => {
	it("a node reachable via two 1st-hop nodes appears only once", () => {
		// active → via1, active → via2; both via1 and via2 link to shared.md
		const idx = buildIndex({
			"active.md": { "via1.md": 1, "via2.md": 1 },
			"via1.md": { "shared.md": 1 },
			"via2.md": { "shared.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 50 }),
			noExclusion,
			makeRelationsCache(),
		);

		const allSecondHopPaths = result.secondHop.flatMap((g) => g.items.map((i) => i.path));
		const occurrences = allSecondHopPaths.filter((p) => p === "shared.md");
		expect(occurrences).toHaveLength(1);
	});

	it("groups without items are omitted from secondHop result", () => {
		// active → via1 → shared; active → via2 → shared (deduped away from via2 group)
		const idx = buildIndex({
			"active.md": { "via1.md": 1, "via2.md": 1 },
			"via1.md": { "shared.md": 1 },
			"via2.md": { "shared.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 50 }),
			noExclusion,
			makeRelationsCache(),
		);

		// Each group must have at least one item
		for (const group of result.secondHop) {
			expect(group.items.length).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// secondHop — cap enforcement (hub-note test)
// ---------------------------------------------------------------------------

describe("computeRelations — secondHop cap enforcement", () => {
	it("truncated is true when cap is hit before exhausting candidates", () => {
		// via1 → many second-hop notes, but cap is 2
		const idx = buildIndex({
			"active.md": { "via1.md": 1 },
			"via1.md": { "s1.md": 1, "s2.md": 1, "s3.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 2 }),
			noExclusion,
			makeRelationsCache(),
		);

		const totalItems = result.secondHop.reduce((sum, g) => sum + g.items.length, 0);
		expect(totalItems).toBe(2);
		expect(result.truncated).toBe(true);
	});

	it("truncated is false when all candidates fit within cap", () => {
		const idx = buildIndex({
			"active.md": { "via1.md": 1 },
			"via1.md": { "s1.md": 1, "s2.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 10 }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.truncated).toBe(false);
	});

	it("total items across all groups equals exactly cap when hit", () => {
		// active → via1 → [s1, s2, s3]; active → via2 → [s4, s5]; cap = 3
		const idx = buildIndex({
			"active.md": { "via1.md": 1, "via2.md": 1 },
			"via1.md": { "s1.md": 1, "s2.md": 1, "s3.md": 1 },
			"via2.md": { "s4.md": 1, "s5.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 3 }),
			noExclusion,
			makeRelationsCache(),
		);

		const totalItems = result.secondHop.reduce((sum, g) => sum + g.items.length, 0);
		expect(totalItems).toBe(3);
		expect(result.truncated).toBe(true);
	});

	it("truncated is false when candidates exactly equal the cap (cap=3, exactly 3 eligible)", () => {
		// One via, exactly cap eligible 2nd-hop candidates — should NOT truncate.
		const idx = buildIndex({
			"active.md": { "via1.md": 1 },
			"via1.md": { "s1.md": 1, "s2.md": 1, "s3.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 3 }),
			noExclusion,
			makeRelationsCache(),
		);

		const totalItems = result.secondHop.reduce((sum, g) => sum + g.items.length, 0);
		expect(totalItems).toBe(3);
		expect(result.truncated).toBe(false);
	});

	it("truncated is true when 4th eligible candidate is in a second via group (cross-group overflow)", () => {
		// via1 → [s1, s2]; via2 → [s3, s4]; cap = 3 → s4 is the overflow candidate
		const idx = buildIndex({
			"active.md": { "via1.md": 1, "via2.md": 1 },
			"via1.md": { "s1.md": 1, "s2.md": 1 },
			"via2.md": { "s3.md": 1, "s4.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 3 }),
			noExclusion,
			makeRelationsCache(),
		);

		const totalItems = result.secondHop.reduce((sum, g) => sum + g.items.length, 0);
		expect(totalItems).toBe(3);
		expect(result.truncated).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// missing (unresolved targets of the active note)
// ---------------------------------------------------------------------------

describe("computeRelations — missing", () => {
	it("returns MissingItem for each unresolved target of the active note", () => {
		const result = computeRelations(
			buildIndex(),
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache({ "active.md": { "Ghost Note": 1, "Another Ghost": 2 } }),
		);

		const targets = result.missing.map((m) => m.target);
		expect(targets).toContain("Ghost Note");
		expect(targets).toContain("Another Ghost");
		expect(result.missing).toHaveLength(2);
	});

	it("returns empty missing when active note has no unresolved targets", () => {
		const result = computeRelations(
			buildIndex({ "active.md": { "resolved.md": 1 } }),
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result.missing).toEqual([]);
	});

	it("does not list other notes' unresolved targets — only active note's", () => {
		const result = computeRelations(
			buildIndex(),
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			noExclusion,
			makeRelationsCache({
				"active.md": { "ActiveGhost": 1 },
				"other.md": { "OtherGhost": 1 },
			}),
		);

		const targets = result.missing.map((m) => m.target);
		expect(targets).toContain("ActiveGhost");
		expect(targets).not.toContain("OtherGhost");
	});
});

// ---------------------------------------------------------------------------
// Active note absent / empty activePath
// ---------------------------------------------------------------------------

describe("computeRelations — absent active note", () => {
	it("returns all-empty result when activePath is empty string — no throw", () => {
		const idx = buildIndex({ "a.md": { "b.md": 1 } });
		const result = computeRelations(
			idx,
			"",
			makeSettings(),
			noExclusion,
			makeRelationsCache({ "a.md": { "Ghost": 1 } }),
		);

		expect(result).toEqual({
			outgoing: [],
			backlinks: [],
			secondHop: [],
			missing: [],
			truncated: false,
		});
	});

	it("returns all-empty result when active note has no entries in index — no throw", () => {
		const idx = buildIndex({ "a.md": { "b.md": 1 } });
		const result = computeRelations(
			idx,
			"unknown-note.md",
			makeSettings(),
			noExclusion,
			makeRelationsCache(),
		);

		expect(result).toEqual({
			outgoing: [],
			backlinks: [],
			secondHop: [],
			missing: [],
			truncated: false,
		});
	});
});

// ---------------------------------------------------------------------------
// Exclusion predicate
// ---------------------------------------------------------------------------

describe("computeRelations — exclusion predicate", () => {
	it("excludes paths matching the predicate from outgoing", () => {
		const idx = buildIndex({ "active.md": { "excluded.md": 1, "kept.md": 1 } });
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			(path) => path === "excluded.md",
			makeRelationsCache(),
		);

		const paths = result.outgoing.map((r) => r.path);
		expect(paths).not.toContain("excluded.md");
		expect(paths).toContain("kept.md");
	});

	it("excludes paths matching the predicate from backlinks", () => {
		const idx = buildIndex({
			"excluded.md": { "active.md": 1 },
			"kept.md": { "active.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: false }),
			(path) => path === "excluded.md",
			makeRelationsCache(),
		);

		const paths = result.backlinks.map((r) => r.path);
		expect(paths).not.toContain("excluded.md");
		expect(paths).toContain("kept.md");
	});

	it("excludes paths matching the predicate from secondHop items", () => {
		const idx = buildIndex({
			"active.md": { "via.md": 1 },
			"via.md": { "excluded.md": 1, "kept.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 50 }),
			(path) => path === "excluded.md",
			makeRelationsCache(),
		);

		const allSecondHopPaths = result.secondHop.flatMap((g) => g.items.map((i) => i.path));
		expect(allSecondHopPaths).not.toContain("excluded.md");
		expect(allSecondHopPaths).toContain("kept.md");
	});

	it("excludes via nodes from secondHop groups when they match the predicate", () => {
		// If the via node itself is excluded, its whole group should be dropped
		const idx = buildIndex({
			"active.md": { "excluded-via.md": 1, "kept-via.md": 1 },
			"excluded-via.md": { "second1.md": 1 },
			"kept-via.md": { "second2.md": 1 },
		});
		const result = computeRelations(
			idx,
			"active.md",
			makeSettings({ secondHopEnabled: true, secondHopCap: 50 }),
			(path) => path === "excluded-via.md",
			makeRelationsCache(),
		);

		const viaPaths = result.secondHop.map((g) => g.via.path);
		expect(viaPaths).not.toContain("excluded-via.md");
		expect(viaPaths).toContain("kept-via.md");
	});
});
