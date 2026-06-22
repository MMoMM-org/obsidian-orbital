/**
 * Wikilink parse/rewrite utility — T3.1
 *
 * PURE functions: no imports from 'obsidian' or any module with side effects.
 * This is the correctness-critical core of the vault-wide bulk-rewrite engine.
 *
 * Grammar handled:
 *   [[target]]
 *   [[target|alias]]
 *   [[target#heading]]
 *   [[target#^block]]
 *   [[target#heading|alias]]
 *   ![[...any of above...]]   — embed variant (leading '!')
 *
 * Wikilink body structure (in parse order):
 *   1. target   — everything before the first '#' or '|'
 *   2. subpath  — from '#' up to '|' or end, including leading '#'
 *   3. alias    — everything after the first '|'
 *   '#' must appear before '|' when both are present.
 *
 * Domain rule reference: docs/ai/memory/domain.md
 */

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ParsedLink {
	/** The full matched link text, e.g. "![[Target#heading|Alias]]". */
	full: string;
	/** The link target/path portion, e.g. "Target". */
	target: string;
	/** "#heading" or "#^block" including the leading '#', or "" if none. */
	subpath: string;
	/** The alias after '|', or "" if none. */
	alias: string;
	/** true if the link starts with '!'. */
	embed: boolean;
}

// ---------------------------------------------------------------------------
// parseLinkAtOffset
// ---------------------------------------------------------------------------

/**
 * Slice `text[startOffset:endOffset]` (the full link including brackets and
 * optional leading '!') and parse out embed, target, subpath, and alias.
 *
 * On malformed input (missing brackets, offsets out of range, empty body):
 * never throws — returns a best-effort ParsedLink with empty fields.
 */
export function parseLinkAtOffset(
	text: string,
	startOffset: number,
	endOffset: number,
): ParsedLink {
	const safe = safeSlice(text, startOffset, endOffset);
	return parseRaw(safe);
}

// ---------------------------------------------------------------------------
// rewriteTarget
// ---------------------------------------------------------------------------

/**
 * Reconstruct the link with only the target replaced.
 * Preserves embed '!', subpath, and alias exactly.
 */
export function rewriteTarget(link: ParsedLink, newTarget: string): string {
	const prefix = link.embed ? "![[" : "[[";
	const aliasPart = link.alias !== "" ? `|${link.alias}` : "";
	return `${prefix}${newTarget}${link.subpath}${aliasPart}]]`;
}

// ---------------------------------------------------------------------------
// toAlias
// ---------------------------------------------------------------------------

/**
 * Convert a link to point at `realTarget` while preserving the original
 * visible display text as an alias.
 *
 * Rule for display text:
 *   - If the original link already has an alias, keep that alias.
 *   - Otherwise use the original target (the human-readable name of the
 *     unresolved link), so that [[Foo]] → [[RealNote|Foo]] — the reader
 *     continues to see "Foo" in the rendered document.
 *   - The subpath is intentionally NOT included in the display text because
 *     aliases render as plain text in Obsidian; the anchor is carried by
 *     the new target reference if the caller wants it.
 *
 * Embed prefix is preserved.
 */
export function toAlias(link: ParsedLink, realTarget: string): string {
	const displayText = link.alias !== "" ? link.alias : link.target;
	const prefix = link.embed ? "![[" : "[[";
	return `${prefix}${realTarget}|${displayText}]]`;
}

// ---------------------------------------------------------------------------
// removeLink
// ---------------------------------------------------------------------------

/**
 * Produce the plain text that should replace the link when "unlinking" —
 * i.e. the visible text a reader would have seen.
 *
 * Rule:
 *   - alias if present, else target.
 *   - If neither alias nor target (malformed), return "".
 *   - Embeds: removing an embed yields the same visible text without '!';
 *     the embed marker is not part of human-readable prose.
 */
export function removeLink(link: ParsedLink): string {
	if (link.alias !== "") return link.alias;
	if (link.target !== "") return link.target;
	return "";
}

// ---------------------------------------------------------------------------
// targetMatches
// ---------------------------------------------------------------------------

/**
 * Case-insensitive comparison of a link's target against a search target.
 * Obsidian resolves wikilinks case-insensitively; this helper ensures
 * callers can locate links without caring about case.
 */
export function targetMatches(link: ParsedLink, searchTarget: string): boolean {
	return link.target.toLowerCase() === searchTarget.toLowerCase();
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Clamp and slice, never throwing on out-of-range offsets. */
function safeSlice(text: string, start: number, end: number): string {
	const s = Math.max(0, Math.min(start, text.length));
	const e = Math.max(s, Math.min(end, text.length));
	return text.slice(s, e);
}

/**
 * Parse a raw link string (the sliced text) into a ParsedLink.
 * Handles all grammar forms; never throws.
 */
function parseRaw(raw: string): ParsedLink {
	const empty: ParsedLink = { full: "", target: "", subpath: "", alias: "", embed: false };

	if (raw === "") return empty;

	// Detect embed prefix.
	const embed = raw.startsWith("!");
	const withoutBang = embed ? raw.slice(1) : raw;

	// Strip outer [[ ... ]] brackets.  If the brackets are missing or
	// incomplete we still do a best-effort parse on whatever body is left.
	let body: string;
	if (withoutBang.startsWith("[[") && withoutBang.endsWith("]]")) {
		body = withoutBang.slice(2, -2);
	} else if (withoutBang.startsWith("[[")) {
		// Missing closing brackets — parse the rest as body.
		body = withoutBang.slice(2);
	} else {
		// No recognisable bracket structure — best-effort: treat whole string as body.
		body = withoutBang;
	}

	return parseBody(raw, body, embed);
}

/**
 * Split the link body into target / subpath / alias.
 *
 * Parse order (mirrors Obsidian's grammar):
 *   1. Find first '#' — everything before is target, from '#' onward is
 *      the subpath candidate.
 *   2. Within the subpath candidate, find first '|' — split alias there.
 *   3. If no '#', find first '|' directly in body — split alias there,
 *      target is everything before.
 */
function parseBody(full: string, body: string, embed: boolean): ParsedLink {
	const hashIdx = body.indexOf("#");
	const pipeIdx = body.indexOf("|");

	let target: string;
	let subpath: string;
	let alias: string;

	if (hashIdx !== -1 && (pipeIdx === -1 || hashIdx < pipeIdx)) {
		// Has '#' that comes before any '|'.
		target = body.slice(0, hashIdx);
		const afterHash = body.slice(hashIdx); // includes '#'
		const pipeInSubpath = afterHash.indexOf("|");
		if (pipeInSubpath !== -1) {
			subpath = afterHash.slice(0, pipeInSubpath);
			alias = afterHash.slice(pipeInSubpath + 1);
		} else {
			subpath = afterHash;
			alias = "";
		}
	} else if (pipeIdx !== -1) {
		// No '#', but has '|'.
		target = body.slice(0, pipeIdx);
		subpath = "";
		alias = body.slice(pipeIdx + 1);
	} else {
		// Plain target only.
		target = body;
		subpath = "";
		alias = "";
	}

	return { full, target, subpath, alias, embed };
}
