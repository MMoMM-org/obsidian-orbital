import { describe, expect, it, vi } from "vitest";
import { ExclusionMatcher } from "shared/ExclusionMatcher";
import {
	createMockTFile,
	createMockCachedMetadata,
	type CachedMetadata,
} from "../__mocks__/obsidian";

// Helper: build a MetadataCache stub whose getFileCache returns the given cache.
function makeCache(cached: CachedMetadata | null) {
	return {
		getFileCache: vi.fn(() => cached),
		on: vi.fn(),
	};
}

// ---------------------------------------------------------------------------
// Path pattern matching
// ---------------------------------------------------------------------------
describe("ExclusionMatcher — path patterns", () => {
	it("excludes a file whose path matches a valid regex pattern", () => {
		const matcher = new ExclusionMatcher(["^daily/"], []);
		const file = createMockTFile({ path: "daily/2024-01-01.md" });
		expect(matcher.isExcluded(file, makeCache(null))).toBe(true);
	});

	it("does not exclude a file whose path does not match any pattern", () => {
		const matcher = new ExclusionMatcher(["^daily/"], []);
		const file = createMockTFile({ path: "notes/idea.md" });
		expect(matcher.isExcluded(file, makeCache(null))).toBe(false);
	});

	it("matches using full regex semantics (anchors, groups)", () => {
		const matcher = new ExclusionMatcher(["(private|secret)/"], []);
		const file = createMockTFile({ path: "secret/plan.md" });
		expect(matcher.isExcluded(file, makeCache(null))).toBe(true);
	});

	it("treats an invalid regex pattern as no-match without throwing", () => {
		const matcher = new ExclusionMatcher(["[invalid("], []);
		const file = createMockTFile({ path: "[invalid(.md" });
		// Even a path that looks like the broken pattern must not throw and must
		// not match (because the regex itself was invalid).
		expect(() => matcher.isExcluded(file, makeCache(null))).not.toThrow();
		expect(matcher.isExcluded(file, makeCache(null))).toBe(false);
	});

	it("skips an invalid regex and still matches a valid pattern in the same list", () => {
		const matcher = new ExclusionMatcher(["[invalid(", "^daily/"], []);
		const file = createMockTFile({ path: "daily/2024-01-01.md" });
		expect(matcher.isExcluded(file, makeCache(null))).toBe(true);
	});

	it("excludes nothing when path patterns array is empty", () => {
		const matcher = new ExclusionMatcher([], []);
		const file = createMockTFile({ path: "anything.md" });
		expect(matcher.isExcluded(file, makeCache(null))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Tag pattern matching — frontmatter tags as string[]
// ---------------------------------------------------------------------------
describe("ExclusionMatcher — tag patterns (string[] frontmatter)", () => {
	it("excludes a file whose frontmatter tags array contains a matching tag", () => {
		const matcher = new ExclusionMatcher([], ["private"]);
		const file = createMockTFile({ path: "note.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: ["private", "work"] },
		});
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(true);
	});

	it("does not exclude when no tag matches", () => {
		const matcher = new ExclusionMatcher([], ["private"]);
		const file = createMockTFile({ path: "note.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: ["public", "work"] },
		});
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(false);
	});

	it("matches tag pattern as regex against individual tags (not joined blob)", () => {
		// Pattern "^pr" should match "private" but NOT "public" even though
		// the naive join "private,public" would also start with "pr".
		const matcher = new ExclusionMatcher([], ["^pr"]);
		const file = createMockTFile({ path: "note.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: ["private"] },
		});
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(true);
	});

	it("does not match when the pattern only appears in the join boundary, not per-tag", () => {
		// "work,secret" as a comma-join would contain "k,s" — no valid regex
		// pattern issue, but prove per-tag matching: pattern "^work,secret"
		// should NOT match because we test each tag individually.
		const matcher = new ExclusionMatcher([], ["^work,secret"]);
		const file = createMockTFile({ path: "note.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: ["work", "secret"] },
		});
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Tag pattern matching — frontmatter tags as a plain string
// ---------------------------------------------------------------------------
describe("ExclusionMatcher — tag patterns (string frontmatter)", () => {
	it("excludes a file when frontmatter tags is a single string matching the pattern", () => {
		const matcher = new ExclusionMatcher([], ["private"]);
		const file = createMockTFile({ path: "note.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: "private" },
		});
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(true);
	});

	it("does not exclude when a single string tag does not match", () => {
		const matcher = new ExclusionMatcher([], ["private"]);
		const file = createMockTFile({ path: "note.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: "public" },
		});
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Tag pattern matching — missing / undefined frontmatter
// ---------------------------------------------------------------------------
describe("ExclusionMatcher — tag patterns (missing frontmatter)", () => {
	it("does not exclude when getFileCache returns null", () => {
		const matcher = new ExclusionMatcher([], ["private"]);
		const file = createMockTFile({ path: "note.md" });
		expect(matcher.isExcluded(file, makeCache(null))).toBe(false);
	});

	it("does not exclude when frontmatter is missing", () => {
		const matcher = new ExclusionMatcher([], ["private"]);
		const file = createMockTFile({ path: "note.md" });
		const cached: CachedMetadata = { tags: [] };
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(false);
	});

	it("does not exclude when frontmatter.tags is undefined", () => {
		const matcher = new ExclusionMatcher([], ["private"]);
		const file = createMockTFile({ path: "note.md" });
		const cached = createMockCachedMetadata({ frontmatter: {} });
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(false);
	});

	it("excludes nothing when tag patterns array is empty", () => {
		const matcher = new ExclusionMatcher([], []);
		const file = createMockTFile({ path: "note.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: ["private"] },
		});
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Tag pattern — invalid regex
// ---------------------------------------------------------------------------
describe("ExclusionMatcher — invalid tag regex", () => {
	it("treats an invalid tag regex as no-match without throwing", () => {
		const matcher = new ExclusionMatcher([], ["[bad("]);
		const file = createMockTFile({ path: "note.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: ["[bad("] },
		});
		expect(() => matcher.isExcluded(file, makeCache(cached))).not.toThrow();
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Combined path + tag
// ---------------------------------------------------------------------------
describe("ExclusionMatcher — combined path and tag patterns", () => {
	it("excludes when path matches even if no tag matches", () => {
		const matcher = new ExclusionMatcher(["^daily/"], ["private"]);
		const file = createMockTFile({ path: "daily/log.md" });
		const cached = createMockCachedMetadata({ frontmatter: {} });
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(true);
	});

	it("excludes when tag matches even if path does not match", () => {
		const matcher = new ExclusionMatcher(["^daily/"], ["private"]);
		const file = createMockTFile({ path: "notes/thought.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: ["private"] },
		});
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(true);
	});

	it("does not exclude when neither path nor tag matches", () => {
		const matcher = new ExclusionMatcher(["^daily/"], ["private"]);
		const file = createMockTFile({ path: "notes/thought.md" });
		const cached = createMockCachedMetadata({
			frontmatter: { tags: ["public"] },
		});
		expect(matcher.isExcluded(file, makeCache(cached))).toBe(false);
	});
});
