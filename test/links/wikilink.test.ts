/**
 * Wikilink parse/rewrite utility — T3.1
 *
 * TDD: tests written BEFORE implementation (RED phase).
 * Tests exercise observable behaviour through the public API only.
 *
 * Link grammar:
 *   [[target]]
 *   [[target|alias]]
 *   [[target#heading]]
 *   [[target#^block]]
 *   [[target#heading|alias]]
 *   ![[...any of above...]]  — embed variant
 */

import { describe, it, expect } from "vitest";
import {
	parseLinkAtOffset,
	rewriteTarget,
	toAlias,
	removeLink,
	targetMatches,
} from "links/wikilink";
import type { ParsedLink } from "links/wikilink";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Build a surrounding sentence with the given link text at a known offset,
 * returning `{ text, start, end }` so tests can pass real offsets.
 */
function embed(prefix: string, linkText: string): { text: string; start: number; end: number } {
	const start = prefix.length;
	const end = start + linkText.length;
	return { text: prefix + linkText + " rest of sentence.", start, end };
}

// ---------------------------------------------------------------------------
// parseLinkAtOffset — all 6 forms
// ---------------------------------------------------------------------------

describe("parseLinkAtOffset — [[target]] (bare)", () => {
	it("parses target, empty subpath, empty alias, embed=false", () => {
		const { text, start, end } = embed("See ", "[[Note]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.full).toBe("[[Note]]");
		expect(link.target).toBe("Note");
		expect(link.subpath).toBe("");
		expect(link.alias).toBe("");
		expect(link.embed).toBe(false);
	});

	it("handles a target with spaces", () => {
		const { text, start, end } = embed("Go to ", "[[My Long Note]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.target).toBe("My Long Note");
		expect(link.subpath).toBe("");
		expect(link.alias).toBe("");
		expect(link.embed).toBe(false);
	});

	it("handles a target with path separators", () => {
		const { text, start, end } = embed("See ", "[[folder/sub/Note]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.target).toBe("folder/sub/Note");
		expect(link.subpath).toBe("");
		expect(link.alias).toBe("");
	});
});

describe("parseLinkAtOffset — [[target|alias]]", () => {
	it("parses target and alias, empty subpath", () => {
		const { text, start, end } = embed("Read ", "[[Note|My Title]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.full).toBe("[[Note|My Title]]");
		expect(link.target).toBe("Note");
		expect(link.subpath).toBe("");
		expect(link.alias).toBe("My Title");
		expect(link.embed).toBe(false);
	});

	it("alias may contain spaces and special chars", () => {
		const { text, start, end } = embed("", "[[A|Some text — with dashes]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.alias).toBe("Some text — with dashes");
	});
});

describe("parseLinkAtOffset — [[target#heading]]", () => {
	it("parses target and subpath (heading), no alias", () => {
		const { text, start, end } = embed("See ", "[[Note#Introduction]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.full).toBe("[[Note#Introduction]]");
		expect(link.target).toBe("Note");
		expect(link.subpath).toBe("#Introduction");
		expect(link.alias).toBe("");
		expect(link.embed).toBe(false);
	});

	it("subpath includes the leading '#'", () => {
		const { text, start, end } = embed("", "[[Doc#Section 2]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.subpath).toBe("#Section 2");
	});
});

describe("parseLinkAtOffset — [[target#^block]]", () => {
	it("parses target and block-ref subpath", () => {
		const { text, start, end } = embed("Ref: ", "[[Note#^abc123]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.full).toBe("[[Note#^abc123]]");
		expect(link.target).toBe("Note");
		expect(link.subpath).toBe("#^abc123");
		expect(link.alias).toBe("");
		expect(link.embed).toBe(false);
	});
});

describe("parseLinkAtOffset — [[target#heading|alias]]", () => {
	it("parses target, subpath, and alias together", () => {
		const { text, start, end } = embed("", "[[Note#Section|Click here]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.full).toBe("[[Note#Section|Click here]]");
		expect(link.target).toBe("Note");
		expect(link.subpath).toBe("#Section");
		expect(link.alias).toBe("Click here");
		expect(link.embed).toBe(false);
	});

	it("block ref with alias", () => {
		const { text, start, end } = embed("", "[[Note#^b1|block alias]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.target).toBe("Note");
		expect(link.subpath).toBe("#^b1");
		expect(link.alias).toBe("block alias");
	});
});

describe("parseLinkAtOffset — embed ![[...]]", () => {
	it("bare embed: embed=true, target, no subpath/alias", () => {
		const { text, start, end } = embed("", "![[Image.png]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.full).toBe("![[Image.png]]");
		expect(link.target).toBe("Image.png");
		expect(link.subpath).toBe("");
		expect(link.alias).toBe("");
		expect(link.embed).toBe(true);
	});

	it("embed with heading subpath", () => {
		const { text, start, end } = embed("", "![[Note#Heading]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.embed).toBe(true);
		expect(link.target).toBe("Note");
		expect(link.subpath).toBe("#Heading");
		expect(link.alias).toBe("");
	});

	it("embed with alias", () => {
		const { text, start, end } = embed("", "![[Note|caption]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.embed).toBe(true);
		expect(link.target).toBe("Note");
		expect(link.alias).toBe("caption");
	});

	it("embed with subpath and alias", () => {
		const { text, start, end } = embed("", "![[Note#^blk|label]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.embed).toBe(true);
		expect(link.target).toBe("Note");
		expect(link.subpath).toBe("#^blk");
		expect(link.alias).toBe("label");
	});
});

// ---------------------------------------------------------------------------
// parseLinkAtOffset — offset slicing in real sentence
// ---------------------------------------------------------------------------

describe("parseLinkAtOffset — real-sentence offset slicing", () => {
	it("slices the correct link from a multi-link sentence", () => {
		// Two links in one string; each has distinct offsets.
		const text = "Start [[First]] and then [[Second#h|label]] end.";
		//             01234567         15        25
		const link1 = parseLinkAtOffset(text, 6, 15);
		expect(link1.full).toBe("[[First]]");
		expect(link1.target).toBe("First");

		const link2 = parseLinkAtOffset(text, 25, 43);
		expect(link2.full).toBe("[[Second#h|label]]");
		expect(link2.target).toBe("Second");
		expect(link2.subpath).toBe("#h");
		expect(link2.alias).toBe("label");
	});

	it("embed link extracted from surrounding prose", () => {
		const text = "See ![[Chart.png]] for details.";
		const link = parseLinkAtOffset(text, 4, 18);
		expect(link.full).toBe("![[Chart.png]]");
		expect(link.embed).toBe(true);
		expect(link.target).toBe("Chart.png");
	});
});

// ---------------------------------------------------------------------------
// parseLinkAtOffset — malformed / edge inputs (never throw)
// ---------------------------------------------------------------------------

describe("parseLinkAtOffset — malformed inputs do not throw", () => {
	it("missing closing brackets returns best-effort result", () => {
		const text = "[[Broken";
		expect(() => parseLinkAtOffset(text, 0, 8)).not.toThrow();
	});

	it("empty offsets range returns safe empty result", () => {
		const text = "Hello world";
		const link = parseLinkAtOffset(text, 5, 5);
		expect(link.target).toBe("");
		expect(link.full).toBe("");
	});

	it("offsets beyond string length do not throw", () => {
		const text = "short";
		expect(() => parseLinkAtOffset(text, 0, 100)).not.toThrow();
	});

	it("empty string does not throw, returns empty ParsedLink", () => {
		expect(() => parseLinkAtOffset("", 0, 0)).not.toThrow();
		const link = parseLinkAtOffset("", 0, 0);
		expect(link.target).toBe("");
	});

	it("stray '#' before any target is handled safely", () => {
		const { text, start, end } = embed("", "[[#heading-only]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.target).toBe("");
		expect(link.subpath).toBe("#heading-only");
	});

	it("stray '|' with no target handled safely", () => {
		const { text, start, end } = embed("", "[[|alias-only]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.target).toBe("");
		expect(link.alias).toBe("alias-only");
	});

	it("empty brackets [[]] returns empty target", () => {
		const { text, start, end } = embed("", "[[]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(link.target).toBe("");
		expect(link.subpath).toBe("");
		expect(link.alias).toBe("");
	});
});

// ---------------------------------------------------------------------------
// rewriteTarget — preserves everything except target
// ---------------------------------------------------------------------------

describe("rewriteTarget", () => {
	it("bare link: replaces target only", () => {
		const { text, start, end } = embed("", "[[Old]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(rewriteTarget(link, "New")).toBe("[[New]]");
	});

	it("link with alias: preserves alias", () => {
		const { text, start, end } = embed("", "[[Old|My Alias]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(rewriteTarget(link, "New")).toBe("[[New|My Alias]]");
	});

	it("link with subpath: preserves subpath", () => {
		const { text, start, end } = embed("", "[[Old#heading]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(rewriteTarget(link, "New")).toBe("[[New#heading]]");
	});

	it("link with block ref: preserves block ref", () => {
		const { text, start, end } = embed("", "[[Old#^blk]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(rewriteTarget(link, "New")).toBe("[[New#^blk]]");
	});

	it("link with subpath and alias: preserves both", () => {
		const { text, start, end } = embed("", "[[Old#Section|Click]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(rewriteTarget(link, "New")).toBe("[[New#Section|Click]]");
	});

	it("embed bare: preserves '!'", () => {
		const { text, start, end } = embed("", "![[Old]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(rewriteTarget(link, "New")).toBe("![[New]]");
	});

	it("embed with subpath and alias: preserves all parts", () => {
		const { text, start, end } = embed("", "![[Old#h|A]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(rewriteTarget(link, "New")).toBe("![[New#h|A]]");
	});

	it("newTarget may include path separators", () => {
		const { text, start, end } = embed("", "[[Note]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(rewriteTarget(link, "folder/NewNote")).toBe("[[folder/NewNote]]");
	});
});

// ---------------------------------------------------------------------------
// toAlias
// ---------------------------------------------------------------------------

describe("toAlias", () => {
	it("[[Foo]] → [[Real|Foo]]: uses original target as display text when no alias", () => {
		// Scenario: dangling [[Foo]] now resolves to existing note 'RealNote'.
		// The visible text should stay 'Foo' (original name).
		const { text, start, end } = embed("", "[[Foo]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(toAlias(link, "RealNote")).toBe("[[RealNote|Foo]]");
	});

	it("[[Foo|Bar]] → [[Real|Bar]]: preserves existing alias as display text", () => {
		const { text, start, end } = embed("", "[[Foo|Bar]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(toAlias(link, "RealNote")).toBe("[[RealNote|Bar]]");
	});

	it("[[Foo#h]] → [[Real|Foo]]: uses target only (not subpath) as display text", () => {
		// When the original was [[Note#Section]], the display text is just 'Note'.
		const { text, start, end } = embed("", "[[Foo#h]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(toAlias(link, "RealNote")).toBe("[[RealNote|Foo]]");
	});

	it("embed ![[Foo]] → ![[Real|Foo]]: embed prefix is preserved", () => {
		const { text, start, end } = embed("", "![[Foo]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(toAlias(link, "RealNote")).toBe("![[RealNote|Foo]]");
	});

	it("embed ![[Foo|cap]] → ![[Real|cap]]: existing alias wins over target", () => {
		const { text, start, end } = embed("", "![[Foo|cap]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(toAlias(link, "RealNote")).toBe("![[RealNote|cap]]");
	});
});

// ---------------------------------------------------------------------------
// removeLink
// ---------------------------------------------------------------------------

describe("removeLink", () => {
	it("[[Foo]] → 'Foo': target text when no alias", () => {
		const { text, start, end } = embed("", "[[Foo]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(removeLink(link)).toBe("Foo");
	});

	it("[[Foo|Bar]] → 'Bar': alias wins over target", () => {
		const { text, start, end } = embed("", "[[Foo|Bar]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(removeLink(link)).toBe("Bar");
	});

	it("[[Foo#h]] → 'Foo': target only (no subpath in plain text)", () => {
		const { text, start, end } = embed("", "[[Foo#h]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(removeLink(link)).toBe("Foo");
	});

	it("[[Foo#h|A]] → 'A': alias wins", () => {
		const { text, start, end } = embed("", "[[Foo#h|A]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(removeLink(link)).toBe("A");
	});

	it("![[Foo]] → 'Foo': embed yields target text (no '!')", () => {
		// Removing an embed yields the same visible text without the '!' prefix.
		const { text, start, end } = embed("", "![[Foo]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(removeLink(link)).toBe("Foo");
	});

	it("![[Foo|cap]] → 'cap': embed with alias yields alias", () => {
		const { text, start, end } = embed("", "![[Foo|cap]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(removeLink(link)).toBe("cap");
	});

	it("malformed link with empty target and no alias → empty string", () => {
		// Edge case per spec: if neither alias nor target, return "".
		const link: ParsedLink = { full: "[[]]", target: "", subpath: "", alias: "", embed: false };
		expect(removeLink(link)).toBe("");
	});
});

// ---------------------------------------------------------------------------
// targetMatches — case-insensitive comparison
// ---------------------------------------------------------------------------

describe("targetMatches", () => {
	it("matches identical targets", () => {
		const { text, start, end } = embed("", "[[MyNote]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(targetMatches(link, "MyNote")).toBe(true);
	});

	it("matches case-insensitively (Obsidian convention)", () => {
		const { text, start, end } = embed("", "[[MyNote]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(targetMatches(link, "mynote")).toBe(true);
		expect(targetMatches(link, "MYNOTE")).toBe(true);
	});

	it("returns false for non-matching target", () => {
		const { text, start, end } = embed("", "[[Alpha]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(targetMatches(link, "Beta")).toBe(false);
	});

	it("is case-insensitive on both sides (link target may be any case)", () => {
		const { text, start, end } = embed("", "[[UPPER]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(targetMatches(link, "upper")).toBe(true);
	});

	it("target with path: full path compared case-insensitively", () => {
		const { text, start, end } = embed("", "[[Folder/MyNote]]");
		const link = parseLinkAtOffset(text, start, end);
		expect(targetMatches(link, "folder/mynote")).toBe(true);
		expect(targetMatches(link, "folder/OtherNote")).toBe(false);
	});

	it("empty link target does not match non-empty search", () => {
		const link: ParsedLink = { full: "[[]]", target: "", subpath: "", alias: "", embed: false };
		expect(targetMatches(link, "Something")).toBe(false);
	});

	it("empty search target matches empty link target", () => {
		const link: ParsedLink = { full: "[[]]", target: "", subpath: "", alias: "", embed: false };
		expect(targetMatches(link, "")).toBe(true);
	});
});
