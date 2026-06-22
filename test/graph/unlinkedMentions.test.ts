/**
 * Unlinked-mentions pure scanner — TDD (tests written BEFORE implementation).
 *
 * Exercises the observable behaviour of the pure scanning helpers through their
 * public API only. No Obsidian imports — these functions operate on plain text
 * plus a structural file-cache subset, mirroring links/wikilink.ts.
 */

import { describe, it, expect } from "vitest";
import {
	scanTextForMentions,
	buildSnippet,
	collectMaskSpans,
} from "graph/unlinkedMentions";
import type { MaskSpan } from "graph/unlinkedMentions";

// ---------------------------------------------------------------------------
// scanTextForMentions — basic matching
// ---------------------------------------------------------------------------

describe("scanTextForMentions — matching", () => {
	it("finds a plain-text occurrence and reports its offsets + matched text", () => {
		const text = "Read about Zettelkasten today.";
		const matches = scanTextForMentions(text, ["Zettelkasten"], []);
		expect(matches).toHaveLength(1);
		expect(text.slice(matches[0]!.start, matches[0]!.end)).toBe("Zettelkasten");
		expect(matches[0]!.matchedText).toBe("Zettelkasten");
	});

	it("matches case-insensitively but preserves the document's casing", () => {
		const text = "the zettelkasten method";
		const matches = scanTextForMentions(text, ["Zettelkasten"], []);
		expect(matches).toHaveLength(1);
		expect(matches[0]!.matchedText).toBe("zettelkasten");
	});

	it("respects word boundaries (no 'Java' inside 'JavaScript')", () => {
		const text = "I love JavaScript and Java.";
		const matches = scanTextForMentions(text, ["Java"], []);
		expect(matches).toHaveLength(1);
		expect(matches[0]!.start).toBe(text.lastIndexOf("Java"));
	});

	it("matches multi-word names", () => {
		const text = "See Atlas of Concepts for more.";
		const matches = scanTextForMentions(text, ["Atlas of Concepts"], []);
		expect(matches).toHaveLength(1);
		expect(matches[0]!.matchedText).toBe("Atlas of Concepts");
	});

	it("finds every occurrence, sorted by position", () => {
		const text = "Zettelkasten here, Zettelkasten there.";
		const matches = scanTextForMentions(text, ["Zettelkasten"], []);
		expect(matches).toHaveLength(2);
		expect(matches[0]!.start).toBeLessThan(matches[1]!.start);
	});

	it("matches any of several names (basename + aliases)", () => {
		const text = "ZK is short for the Zettelkasten system.";
		const matches = scanTextForMentions(text, ["Zettelkasten", "ZK"], []);
		expect(matches).toHaveLength(2);
		const texts = matches.map((m) => m.matchedText).sort();
		expect(texts).toEqual(["ZK", "Zettelkasten"]);
	});

	it("does not double-count when names overlap (keeps the longer match)", () => {
		const text = "The Atlas of Concepts page.";
		const matches = scanTextForMentions(text, ["Atlas", "Atlas of Concepts"], []);
		expect(matches).toHaveLength(1);
		expect(matches[0]!.matchedText).toBe("Atlas of Concepts");
	});

	it("ignores empty / blank names", () => {
		const text = "Zettelkasten";
		expect(scanTextForMentions(text, ["", "   "], [])).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// scanTextForMentions — masking
// ---------------------------------------------------------------------------

describe("scanTextForMentions — masking", () => {
	it("skips occurrences that fall inside a mask span", () => {
		const text = "A [[Zettelkasten]] link and a Zettelkasten mention.";
		const linkStart = text.indexOf("[[");
		const linkEnd = text.indexOf("]]") + 2;
		const mask: MaskSpan[] = [{ start: linkStart, end: linkEnd }];
		const matches = scanTextForMentions(text, ["Zettelkasten"], mask);
		expect(matches).toHaveLength(1);
		// The surviving match is the plain-text one, not the linked one.
		expect(matches[0]!.start).toBeGreaterThan(linkEnd);
	});
});

// ---------------------------------------------------------------------------
// collectMaskSpans — derive spans to skip
// ---------------------------------------------------------------------------

describe("collectMaskSpans", () => {
	it("masks wikilink and embed positions from the file cache", () => {
		const text = "x [[Foo]] y ![[Bar]] z";
		const cache = {
			links: [{ position: { start: { offset: 2 }, end: { offset: 9 } } }],
			embeds: [{ position: { start: { offset: 12 }, end: { offset: 20 } } }],
		};
		const spans = collectMaskSpans(text, cache);
		expect(spans).toContainEqual({ start: 2, end: 9 });
		expect(spans).toContainEqual({ start: 12, end: 20 });
	});

	it("masks the frontmatter block", () => {
		const text = "---\naliases: [ZK]\n---\nZettelkasten body";
		const spans = collectMaskSpans(text, null);
		const fmEnd = text.indexOf("---\n", 3) + 3;
		expect(spans.some((s) => s.start === 0 && s.end >= fmEnd)).toBe(true);
	});

	it("does NOT mask code spans (Obsidian counts mentions inside backticks)", () => {
		const text = "a `code` b\n```\nfenced\n```\n end";
		const spans = collectMaskSpans(text, null);
		expect(spans).toHaveLength(0);
	});

	it("masks markdown link syntax", () => {
		const text = "see [label](http://x) here";
		const spans = collectMaskSpans(text, null);
		expect(spans.some((s) => text.slice(s.start, s.end) === "[label](http://x)")).toBe(true);
	});

	it("returns regex-derived spans even when cache is null", () => {
		const text = "plain [[x]] text";
		expect(collectMaskSpans(text, null).length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// scanTextForMentions + collectMaskSpans integration
// ---------------------------------------------------------------------------

describe("scanTextForMentions — does not match inside masked regions", () => {
	it("ignores a name that only appears inside a wikilink", () => {
		const text = "Only [[Zettelkasten]] here.";
		const spans = collectMaskSpans(text, null);
		// No cache positions, but the markdown/wikilink regex should cover it.
		const matches = scanTextForMentions(text, ["Zettelkasten"], spans);
		expect(matches).toHaveLength(0);
	});

	it("ignores a name that only appears in frontmatter", () => {
		const text = "---\ntags: Zettelkasten\n---\nbody text";
		const spans = collectMaskSpans(text, null);
		const matches = scanTextForMentions(text, ["Zettelkasten"], spans);
		expect(matches).toHaveLength(0);
	});

	it("counts mentions inside backticks/code (parity with Obsidian)", () => {
		const text = "rename `Inbox` to `Zettelkasten` then merge into `Zettelkasten`.";
		const spans = collectMaskSpans(text, null);
		const matches = scanTextForMentions(text, ["Zettelkasten"], spans);
		expect(matches).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// buildSnippet
// ---------------------------------------------------------------------------

describe("buildSnippet", () => {
	it("splits context into before / hit / after", () => {
		const text = "left context Zettelkasten right context";
		const start = text.indexOf("Zettelkasten");
		const end = start + "Zettelkasten".length;
		const snip = buildSnippet(text, start, end, 40);
		expect(snip.hit).toBe("Zettelkasten");
		expect(snip.before).toContain("left context");
		expect(snip.after).toContain("right context");
	});

	it("adds an ellipsis when context is truncated", () => {
		const long = "x".repeat(100);
		const text = `${long} Zettelkasten ${long}`;
		const start = text.indexOf("Zettelkasten");
		const end = start + "Zettelkasten".length;
		const snip = buildSnippet(text, start, end, 10);
		expect(snip.before.startsWith("…")).toBe(true);
		expect(snip.after.endsWith("…")).toBe(true);
	});

	it("collapses newlines in the context to single spaces", () => {
		const text = "line one\nZettelkasten\nline two";
		const start = text.indexOf("Zettelkasten");
		const end = start + "Zettelkasten".length;
		const snip = buildSnippet(text, start, end, 40);
		expect(snip.before).not.toContain("\n");
		expect(snip.after).not.toContain("\n");
	});
});
