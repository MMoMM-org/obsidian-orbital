/**
 * MentionLinkService — discovers and links "unlinked mentions".
 *
 * An unlinked mention is a plain-text occurrence of the active note's name (or
 * an alias) inside another note, with no link. This service:
 *   - computeGroups(activePath): scans the vault for such mentions, grouped by
 *     source note, memoized per active path (so repaints don't re-scan).
 *   - linkMentions(activePath, sourcePath, offsets?): converts mentions into
 *     wikilinks, re-finding occurrences at apply time and splicing in descending
 *     offset order (never trusting cached offsets) — same discipline as
 *     LinkRewriteService.applySpliceRename.
 *
 * Unlike LinkRewriteService (which locates links via metadataCache positions),
 * this operates on plain TEXT via the pure scanner in graph/unlinkedMentions.
 * Obsidian types are injected as structural subsets so the service is testable
 * without a runtime.
 *
 * Domain rule reference: docs/ai/memory/domain.md
 */

import { Notice } from "obsidian";
import {
	scanTextForMentions,
	collectMaskSpans,
	buildSnippet,
} from "graph/unlinkedMentions";
import type {
	UnlinkedMentionGroup,
	UnlinkedMentionItem,
	MentionFileCache,
} from "graph/unlinkedMentions";

// ---------------------------------------------------------------------------
// Structural Obsidian subsets (injected)
// ---------------------------------------------------------------------------

interface TFileMinimal {
	path: string;
	basename: string;
	extension: string;
}

interface Vault {
	getMarkdownFiles(): TFileMinimal[];
	getFileByPath(path: string): TFileMinimal | null;
	cachedRead(file: TFileMinimal): Promise<string>;
	process(file: TFileMinimal, transform: (data: string) => string): Promise<string>;
}

interface FileManager {
	generateMarkdownLink(
		file: TFileMinimal,
		sourcePath: string,
		subpath?: string,
		alias?: string,
	): string;
}

interface FileCacheWithFrontmatter extends MentionFileCache {
	frontmatter?: Record<string, unknown>;
}

interface MetadataCacheMinimal {
	getFileCache(file: TFileMinimal): FileCacheWithFrontmatter | null;
}

interface IndexMinimal {
	backlinksOf(path: string): string[];
}

/** Tuning options (mainly for tests). */
export interface MentionLinkServiceOptions {
	/** Files scanned per chunk before yielding to the event loop. Default 25. */
	chunkSize?: number;
}

const DEFAULT_CHUNK_SIZE = 25;

// ---------------------------------------------------------------------------
// MentionLinkService
// ---------------------------------------------------------------------------

export class MentionLinkService {
	private readonly vault: Vault;
	private readonly fileManager: FileManager;
	private readonly metadataCache: MetadataCacheMinimal;
	private readonly index: IndexMinimal;
	private readonly isExcluded: (path: string) => boolean;
	private readonly chunkSize: number;

	/** Memoized result for the most-recently scanned active path. */
	private cached: { path: string; groups: UnlinkedMentionGroup[] } | null = null;
	/** In-flight scan, deduped per active path. */
	private inflight: { path: string; promise: Promise<UnlinkedMentionGroup[]> } | null = null;

	constructor(
		vault: Vault,
		fileManager: FileManager,
		metadataCache: MetadataCacheMinimal,
		index: IndexMinimal,
		isExcluded: (path: string) => boolean,
		options?: MentionLinkServiceOptions,
	) {
		this.vault = vault;
		this.fileManager = fileManager;
		this.metadataCache = metadataCache;
		this.index = index;
		this.isExcluded = isExcluded;
		this.chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
	}

	// -------------------------------------------------------------------------
	// computeGroups (memoized)
	// -------------------------------------------------------------------------

	async computeGroups(activePath: string): Promise<UnlinkedMentionGroup[]> {
		if (this.cached !== null && this.cached.path === activePath) {
			return this.cached.groups;
		}
		if (this.inflight !== null && this.inflight.path === activePath) {
			return this.inflight.promise;
		}

		const promise = this.scan(activePath);
		this.inflight = { path: activePath, promise };
		try {
			const groups = await promise;
			this.cached = { path: activePath, groups };
			return groups;
		} finally {
			if (this.inflight !== null && this.inflight.path === activePath) {
				this.inflight = null;
			}
		}
	}

	/**
	 * Synchronous peek at the memoized result for `activePath`, or null when no
	 * cached result exists yet. Lets the UI render cached rows without kicking a
	 * fresh scan.
	 */
	peek(activePath: string): UnlinkedMentionGroup[] | null {
		return this.cached !== null && this.cached.path === activePath
			? this.cached.groups
			: null;
	}

	/** Drop the memoized result — call when the vault or cache changes. */
	invalidate(): void {
		this.cached = null;
		this.inflight = null;
	}

	// -------------------------------------------------------------------------
	// linkMentions
	// -------------------------------------------------------------------------

	/**
	 * Convert unlinked mentions of the active note inside `sourcePath` into
	 * wikilinks. When `offsets` is supplied, only mentions whose start offset is
	 * in that set are linked (single-occurrence action); otherwise every mention
	 * in the note is linked. Returns the number of mentions linked.
	 */
	async linkMentions(
		activePath: string,
		sourcePath: string,
		offsets?: number[],
	): Promise<number> {
		const activeFile = this.vault.getFileByPath(activePath);
		const sourceFile = this.vault.getFileByPath(sourcePath);
		if (activeFile === null || sourceFile === null) return 0;

		const names = this.namesFor(activeFile);
		if (names.length === 0) return 0;

		const offsetSet = offsets !== undefined ? new Set(offsets) : null;
		let linked = 0;

		await this.vault.process(sourceFile, (data) => {
			const cache = this.metadataCache.getFileCache(sourceFile);
			const maskSpans = collectMaskSpans(data, cache);
			let matches = scanTextForMentions(data, names, maskSpans);
			if (offsetSet !== null) {
				matches = matches.filter((m) => offsetSet.has(m.start));
			}

			// Descending offset order so earlier offsets stay valid after splices.
			matches.sort((a, b) => b.start - a.start);

			let out = data;
			for (const match of matches) {
				const alias = match.matchedText === activeFile.basename ? undefined : match.matchedText;
				const replacement = this.fileManager.generateMarkdownLink(
					activeFile,
					sourcePath,
					undefined,
					alias,
				);
				out = out.slice(0, match.start) + replacement + out.slice(match.end);
				linked++;
			}
			return out;
		});

		this.invalidate();
		if (linked > 0) {
			new Notice(`Linked ${linked} ${linked === 1 ? "mention" : "mentions"}.`);
		}
		return linked;
	}

	// -------------------------------------------------------------------------
	// Private — scanning
	// -------------------------------------------------------------------------

	private async scan(activePath: string): Promise<UnlinkedMentionGroup[]> {
		const activeFile = this.vault.getFileByPath(activePath);
		if (activeFile === null) return [];

		const names = this.namesFor(activeFile);
		if (names.length === 0) return [];

		const lowerNames = names.map((n) => n.toLowerCase());
		const backlinkSet = new Set(this.index.backlinksOf(activePath));

		const candidates = this.vault
			.getMarkdownFiles()
			.filter((f) => f.path !== activePath && !this.isExcluded(f.path));

		const groups: UnlinkedMentionGroup[] = [];

		for (let i = 0; i < candidates.length; i++) {
			const file = candidates[i]!;
			const content = await this.vault.cachedRead(file);

			// Cheap pre-filter before the more expensive scan.
			const lower = content.toLowerCase();
			if (!lowerNames.some((n) => lower.includes(n))) continue;

			const cache = this.metadataCache.getFileCache(file);
			const maskSpans = collectMaskSpans(content, cache);
			const matches = scanTextForMentions(content, names, maskSpans);
			if (matches.length === 0) continue;

			const items: UnlinkedMentionItem[] = matches.map((m) => ({
				...m,
				snippet: buildSnippet(content, m.start, m.end),
			}));

			groups.push({
				path: file.path,
				display: file.basename,
				matches: items,
				alreadyLinks: backlinkSet.has(file.path),
			});

			if ((i + 1) % this.chunkSize === 0) {
				await yieldToEventLoop();
			}
		}

		groups.sort((a, b) => a.display.localeCompare(b.display));
		return groups;
	}

	/** Active note's searchable names: basename + frontmatter aliases. */
	private namesFor(activeFile: TFileMinimal): string[] {
		const names = [activeFile.basename];
		const fm = this.metadataCache.getFileCache(activeFile)?.frontmatter;
		const aliases = fm?.["aliases"] ?? fm?.["alias"];
		if (typeof aliases === "string") {
			names.push(aliases);
		} else if (Array.isArray(aliases)) {
			for (const a of aliases) {
				if (typeof a === "string") names.push(a);
			}
		}
		return names;
	}
}

/**
 * Yield to the event loop between scan chunks so the UI stays responsive.
 * Mirrors LinkRewriteService's helper.
 */
function yieldToEventLoop(): Promise<void> {
	return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}
