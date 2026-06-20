/**
 * Unlinked-mentions pure scanner.
 *
 * PURE functions: no imports from 'obsidian' or any module with side effects —
 * same discipline as links/wikilink.ts. These operate on plain note text plus a
 * structural file-cache subset, so they are directly unit-testable.
 *
 * "Unlinked mention" = a plain-text occurrence of one of the active note's
 * names (basename or an alias) inside ANOTHER note, that is NOT already part of
 * a link. The scanner finds those occurrences (with offsets), and a snippet
 * helper builds the surrounding context for display.
 *
 * Domain rule reference: docs/ai/memory/domain.md
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A half-open character range [start, end) to exclude from matching. */
export interface MaskSpan {
	start: number;
	end: number;
}

/** A single plain-text occurrence of a name in the document. */
export interface MentionMatch {
	/** Character offset where the match starts. */
	start: number;
	/** Character offset just past the match. */
	end: number;
	/** The exact text as it appears in the document (original casing). */
	matchedText: string;
}

/** Context around a match, split so the renderer can highlight the hit. */
export interface MentionSnippet {
	before: string;
	hit: string;
	after: string;
}

/** A match paired with its display snippet. */
export interface UnlinkedMentionItem extends MentionMatch {
	snippet: MentionSnippet;
}

/** All unlinked mentions of the active note found within a single source note. */
export interface UnlinkedMentionGroup {
	/** Vault path of the note containing the mentions. */
	path: string;
	/** Display name (basename without extension). */
	display: string;
	/** Every unlinked occurrence within this note, sorted by position. */
	matches: UnlinkedMentionItem[];
	/** True when this note already has a resolved link to the active note. */
	alreadyLinks: boolean;
}

/** Structural subset of a metadata cache entry needed for masking. */
export interface MentionFileCache {
	links?: Array<{ position: { start: { offset: number }; end: { offset: number } } }>;
	embeds?: Array<{ position: { start: { offset: number }; end: { offset: number } } }>;
}

// ---------------------------------------------------------------------------
// scanTextForMentions
// ---------------------------------------------------------------------------

/** Word characters for boundary checks — Unicode letters, numbers, underscore. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Find every plain-text occurrence of any `name` in `text` that
 *   - is case-insensitive,
 *   - is bounded by non-word characters (so "Java" ≠ "JavaScript"),
 *   - does not overlap any span in `maskSpans`.
 *
 * Overlapping matches from different names are de-duplicated, preferring the
 * longer (more specific) name. Results are returned sorted by start offset.
 */
export function scanTextForMentions(
	text: string,
	names: string[],
	maskSpans: MaskSpan[],
): MentionMatch[] {
	const cleanNames = dedupeNames(names);
	if (cleanNames.length === 0 || text === "") return [];

	const lowerText = text.toLowerCase();
	const raw: MentionMatch[] = [];

	for (const name of cleanNames) {
		const needle = name.toLowerCase();
		let from = 0;
		for (;;) {
			const idx = lowerText.indexOf(needle, from);
			if (idx === -1) break;
			const end = idx + needle.length;
			from = idx + 1;

			if (!hasWordBoundaries(text, idx, end)) continue;
			if (overlapsMask(idx, end, maskSpans)) continue;

			raw.push({ start: idx, end, matchedText: text.slice(idx, end) });
		}
	}

	return dedupeOverlaps(raw);
}

/**
 * Normalise the name list: trim, drop blanks, de-duplicate case-insensitively,
 * and sort longest-first so overlap resolution prefers the more specific name.
 */
function dedupeNames(names: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const name of names) {
		const trimmed = name.trim();
		if (trimmed === "") continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out.sort((a, b) => b.length - a.length);
}

/** True when both edges of [start,end) sit against a non-word character. */
function hasWordBoundaries(text: string, start: number, end: number): boolean {
	const before = start > 0 ? text[start - 1]! : "";
	const after = end < text.length ? text[end]! : "";
	if (before !== "" && WORD_CHAR.test(before)) return false;
	if (after !== "" && WORD_CHAR.test(after)) return false;
	return true;
}

/** True when [start,end) overlaps any mask span. */
function overlapsMask(start: number, end: number, maskSpans: MaskSpan[]): boolean {
	for (const span of maskSpans) {
		if (start < span.end && end > span.start) return true;
	}
	return false;
}

/**
 * Remove matches that are contained within or overlap an already-kept match.
 * Input may contain duplicates/overlaps from multiple names; we keep the
 * longest match at each position. Returns matches sorted by start offset.
 */
function dedupeOverlaps(matches: MentionMatch[]): MentionMatch[] {
	// Longest first, then by position, so the first kept match at any region wins.
	const ordered = [...matches].sort(
		(a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
	);
	const kept: MentionMatch[] = [];
	for (const m of ordered) {
		if (kept.some((k) => m.start < k.end && m.end > k.start)) continue;
		kept.push(m);
	}
	return kept.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// collectMaskSpans
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---/;
const FENCED_CODE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const MARKDOWN_LINK_RE = /\[[^\]]*\]\([^)]*\)/g;
const WIKILINK_RE = /!?\[\[[^\]]*\]\]/g;

/**
 * Derive the spans that must NOT be treated as unlinked mentions:
 *   - existing wikilink/embed positions from the file cache (authoritative),
 *   - the leading frontmatter block,
 *   - fenced and inline code,
 *   - markdown link syntax `[text](url)`,
 *   - wikilink syntax (regex fallback when cache positions are absent).
 *
 * `cache` may be null; in that case only the regex-derived spans are returned.
 */
export function collectMaskSpans(text: string, cache: MentionFileCache | null): MaskSpan[] {
	const spans: MaskSpan[] = [];

	if (cache !== null) {
		for (const entry of [...(cache.links ?? []), ...(cache.embeds ?? [])]) {
			spans.push({ start: entry.position.start.offset, end: entry.position.end.offset });
		}
	}

	const fm = FRONTMATTER_RE.exec(text);
	if (fm !== null) spans.push({ start: 0, end: fm[0].length });

	for (const re of [FENCED_CODE_RE, INLINE_CODE_RE, MARKDOWN_LINK_RE, WIKILINK_RE]) {
		re.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text)) !== null) {
			spans.push({ start: m.index, end: m.index + m[0].length });
		}
	}

	return spans;
}

// ---------------------------------------------------------------------------
// buildSnippet
// ---------------------------------------------------------------------------

/**
 * Build a display snippet around the match [start,end). Returns the context
 * before, the matched text, and the context after as three strings.
 * Whitespace (including newlines) is collapsed to single spaces, and an
 * ellipsis is prepended/appended when the context was truncated.
 */
export function buildSnippet(
	text: string,
	start: number,
	end: number,
	pad = 40,
): MentionSnippet {
	const bStart = Math.max(0, start - pad);
	const aEnd = Math.min(text.length, end + pad);

	const beforeRaw = normalizeWhitespace(text.slice(bStart, start));
	const afterRaw = normalizeWhitespace(text.slice(end, aEnd));

	const before = (bStart > 0 ? "…" : "") + beforeRaw;
	const after = afterRaw + (aEnd < text.length ? "…" : "");

	return { before, hit: text.slice(start, end), after };
}

/** Collapse all whitespace runs (incl. newlines) to single spaces. */
function normalizeWhitespace(s: string): string {
	return s.replace(/\s+/g, " ");
}
