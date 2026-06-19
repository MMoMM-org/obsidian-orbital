/**
 * LinkRewriteService — T3.2
 *
 * Vault-wide bulk-rewrite operations for dangling links:
 *   - previewRename: count occurrences from LinkGraphIndex (no vault I/O)
 *   - applyRename:   offset-splice via vault.process (dangling target) or
 *                    merge via fileManager.generateMarkdownLink (real note)
 *   - applyAlias:    rewrite [[Target]] → [[RealNote|Target]] in source files
 *   - applyDelete:   replace link with plain text (removeLink)
 *
 * Design rules (ADR-5, SDD Runtime View):
 *   - Hybrid engine: real-note targets → generateMarkdownLink; danglings → offset-splice
 *   - Frontmatter links → fileManager.processFrontMatter (never body-splice)
 *   - Sequential per-file execution (never parallel)
 *   - Partial failure: continue batch, accumulate into BulkResult.filesFailed
 *   - Counts re-resolved at apply time, not cached from preview
 *   - No undo — the confirm gate lives in T3.3 modals, not here
 */

import { Notice } from "obsidian";
import type { LinkGraphIndex } from "graph/LinkGraphIndex";
import {
	parseLinkAtOffset,
	rewriteTarget,
	toAlias,
	removeLink,
	targetMatches,
} from "links/wikilink";
import type { ParsedLink } from "links/wikilink";

// ---------------------------------------------------------------------------
// Public types (SDD contract)
// ---------------------------------------------------------------------------

export interface RewritePreview {
	occurrences: number;
	files: { path: string; count: number }[];
}

export interface BulkResult {
	filesSucceeded: number;
	filesFailed: { path: string; error: string }[];
}

export type RewriteScope = { folder?: string };

// ---------------------------------------------------------------------------
// Structural subset of Obsidian types injected via constructor
// ---------------------------------------------------------------------------

interface Position {
	start: { offset: number };
	end: { offset: number };
}

interface LinkEntry {
	position: Position;
}

interface FrontmatterLink {
	key: string;
	link: string;
	original: string;
	displayText?: string;
	position: Position;
}

interface FileCache {
	links?: LinkEntry[];
	embeds?: LinkEntry[];
	frontmatterLinks?: FrontmatterLink[];
}

interface TFileMinimal {
	path: string;
}

interface Vault {
	getAbstractFileByPath(path: string): TFileMinimal | null;
	getFileByPath(path: string): TFileMinimal | null;
	process(file: TFileMinimal, transform: (data: string) => string): Promise<string>;
}

interface FileManager {
	processFrontMatter(file: TFileMinimal, fn: (fm: Record<string, unknown>) => void): Promise<void>;
	generateMarkdownLink(
		file: TFileMinimal,
		sourcePath: string,
		subpath?: string,
		alias?: string,
	): string;
}

interface MetadataCacheMinimal {
	getFileCache(file: TFileMinimal): FileCache | null;
}

interface WorkspaceMinimal {
	getActiveFile(): TFileMinimal | null;
}

// ---------------------------------------------------------------------------
// LinkRewriteService
// ---------------------------------------------------------------------------

/** Options to tune bulk-operation behaviour (mainly for testing). */
export interface LinkRewriteServiceOptions {
	/**
	 * Number of files to process per chunk before yielding to the event loop.
	 * Lower values keep the UI more responsive on large batches.
	 * Default: 10. Set to 1 in tests to verify yield behaviour without needing
	 * thousands of files.
	 */
	chunkSize?: number;
}

/** Default chunk size for bulk operations: yield every 10 files. */
const DEFAULT_CHUNK_SIZE = 10;

export class LinkRewriteService {
	private readonly vault: Vault;
	private readonly fileManager: FileManager;
	private readonly metadataCache: MetadataCacheMinimal;
	private readonly index: LinkGraphIndex;
	private readonly workspace: WorkspaceMinimal;
	private readonly chunkSize: number;

	constructor(
		vault: Vault,
		fileManager: FileManager,
		metadataCache: MetadataCacheMinimal,
		index: LinkGraphIndex,
		workspace: WorkspaceMinimal,
		options?: LinkRewriteServiceOptions,
	) {
		this.vault = vault;
		this.fileManager = fileManager;
		this.metadataCache = metadataCache;
		this.index = index;
		this.workspace = workspace;
		this.chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
	}

	// -------------------------------------------------------------------------
	// previewRename
	// -------------------------------------------------------------------------

	async previewRename(target: string, scope: RewriteScope): Promise<RewritePreview> {
		const dangling = this.index.danglingFor(target);
		if (dangling === null) {
			return { occurrences: 0, files: [] };
		}

		const occurrences = filterOccurrences(dangling.occurrences, scope);
		const totalCount = occurrences.reduce((sum, o) => sum + o.count, 0);
		return {
			occurrences: totalCount,
			files: occurrences.map((o) => ({ path: o.sourcePath, count: o.count })),
		};
	}

	// -------------------------------------------------------------------------
	// applyRename
	// -------------------------------------------------------------------------

	async applyRename(target: string, newName: string, scope: RewriteScope): Promise<BulkResult> {
		const sourcePaths = this.resolveSourcePaths(target, scope);
		const isMergePath = this.vault.getAbstractFileByPath(newName) !== null;

		const result: BulkResult = { filesSucceeded: 0, filesFailed: [] };

		for (let i = 0; i < sourcePaths.length; i++) {
			const sourcePath = sourcePaths[i]!;
			try {
				const file = this.vault.getFileByPath(sourcePath);
				if (file === null) {
					result.filesFailed.push({ path: sourcePath, error: "File not found in vault" });
					continue;
				}

				if (isMergePath) {
					await this.applyMergeRename(file, target, newName);
				} else {
					await this.applySpliceRename(file, target, (link) => rewriteTarget(link, newName));
				}

				await this.applyFrontmatterRename(file, target, newName, isMergePath);

				result.filesSucceeded++;
			} catch (err) {
				result.filesFailed.push({ path: sourcePath, error: String(err instanceof Error ? err.message : err) });
			}

			// Yield to event loop periodically to keep UI responsive (Gap E / SDD §575).
			if ((i + 1) % this.chunkSize === 0) {
				await yieldToEventLoop();
			}
		}

		this.surfaceBulkProgress(result, sourcePaths.length);
		return result;
	}

	// -------------------------------------------------------------------------
	// applyAlias
	// -------------------------------------------------------------------------

	async applyAlias(target: string, realNotePath: string, scope: RewriteScope): Promise<BulkResult> {
		const sourcePaths = this.resolveSourcePaths(target, scope);
		const result: BulkResult = { filesSucceeded: 0, filesFailed: [] };

		// Derive the display target from the real note path basename
		const realTarget = basenameFromPath(realNotePath);

		for (let i = 0; i < sourcePaths.length; i++) {
			const sourcePath = sourcePaths[i]!;
			try {
				const file = this.vault.getFileByPath(sourcePath);
				if (file === null) {
					result.filesFailed.push({ path: sourcePath, error: "File not found in vault" });
					continue;
				}

				await this.applySpliceRename(file, target, (link) => toAlias(link, realTarget));
				await this.applyFrontmatterAlias(file, target, realTarget);

				result.filesSucceeded++;
			} catch (err) {
				result.filesFailed.push({ path: sourcePath, error: String(err instanceof Error ? err.message : err) });
			}

			if ((i + 1) % this.chunkSize === 0) {
				await yieldToEventLoop();
			}
		}

		this.surfaceBulkProgress(result, sourcePaths.length);
		return result;
	}

	// -------------------------------------------------------------------------
	// applyDelete
	// -------------------------------------------------------------------------

	async applyDelete(
		target: string,
		scope: RewriteScope,
		onlyInActiveNote: boolean,
	): Promise<BulkResult> {
		let sourcePaths = this.resolveSourcePaths(target, scope);

		if (onlyInActiveNote) {
			sourcePaths = this.filterToActiveNote(sourcePaths);
		}

		const result: BulkResult = { filesSucceeded: 0, filesFailed: [] };

		for (let i = 0; i < sourcePaths.length; i++) {
			const sourcePath = sourcePaths[i]!;
			try {
				const file = this.vault.getFileByPath(sourcePath);
				if (file === null) {
					result.filesFailed.push({ path: sourcePath, error: "File not found in vault" });
					continue;
				}

				await this.applySpliceRename(file, target, (link) => removeLink(link));
				await this.applyFrontmatterDelete(file, target);

				result.filesSucceeded++;
			} catch (err) {
				result.filesFailed.push({ path: sourcePath, error: String(err instanceof Error ? err.message : err) });
			}

			if ((i + 1) % this.chunkSize === 0) {
				await yieldToEventLoop();
			}
		}

		this.surfaceBulkProgress(result, sourcePaths.length);
		return result;
	}

	// ---------------------------------------------------------------------------
	// Private — bulk progress helpers (Gap E)
	// ---------------------------------------------------------------------------

	/**
	 * Emit a single summary Notice after a bulk operation.
	 * Keeps UX feedback consistent whether the caller (DanglingPanel) shows its
	 * own aria-live update or not.
	 */
	private surfaceBulkProgress(result: BulkResult, total: number): void {
		const failed = result.filesFailed.length;
		const msg = failed === 0
			? `Updated ${result.filesSucceeded} of ${total} files.`
			: `Updated ${result.filesSucceeded} of ${total} files; ${failed} failed.`;
		new Notice(msg);
	}

	// ---------------------------------------------------------------------------
	// Private — core splice engine
	// ---------------------------------------------------------------------------

	/**
	 * Apply `transform` to every body link (links + embeds) in `file` that
	 * case-insensitively matches `target`, using descending-offset splicing so
	 * earlier offsets remain valid after each replacement.
	 */
	private async applySpliceRename(
		file: TFileMinimal,
		target: string,
		transform: (link: ParsedLink) => string,
	): Promise<void> {
		await this.vault.process(file, (data) => {
			const cache = this.metadataCache.getFileCache(file);
			if (cache === null) return data;

			const hits = collectBodyEntries(cache);
			// Descending order so later offsets remain valid after each splice
			hits.sort((a, b) => b.position.start.offset - a.position.start.offset);

			let out = data;
			for (const hit of hits) {
				const start = hit.position.start.offset;
				const end = hit.position.end.offset;
				const parsed = parseLinkAtOffset(out, start, end);
				if (!targetMatches(parsed, target)) continue;
				const replacement = transform(parsed);
				out = out.slice(0, start) + replacement + out.slice(end);
			}
			return out;
		});
	}

	/**
	 * Merge rename: use generateMarkdownLink to build the new link text for
	 * the real note, then splice body links.
	 */
	private async applyMergeRename(
		file: TFileMinimal,
		target: string,
		newName: string,
	): Promise<void> {
		await this.vault.process(file, (data) => {
			const cache = this.metadataCache.getFileCache(file);
			if (cache === null) return data;

			const hits = collectBodyEntries(cache);
			hits.sort((a, b) => b.position.start.offset - a.position.start.offset);

			let out = data;
			for (const hit of hits) {
				const start = hit.position.start.offset;
				const end = hit.position.end.offset;
				const parsed = parseLinkAtOffset(out, start, end);
				if (!targetMatches(parsed, target)) continue;

				// For the merge path, generate the canonical link to the real note
				const realFile = this.vault.getAbstractFileByPath(newName);
				const replacement =
					realFile !== null
						? this.fileManager.generateMarkdownLink(
								realFile,
								file.path,
								parsed.subpath || undefined,
								parsed.alias || undefined,
							)
						: rewriteTarget(parsed, newName);

				out = out.slice(0, start) + replacement + out.slice(end);
			}
			return out;
		});
	}

	// ---------------------------------------------------------------------------
	// Private — frontmatter helpers
	// ---------------------------------------------------------------------------

	private async applyFrontmatterRename(
		file: TFileMinimal,
		target: string,
		newName: string,
		isMergePath: boolean,
	): Promise<void> {
		const cache = this.metadataCache.getFileCache(file);
		if (cache === null || !hasFrontmatterLinks(cache, target)) return;

		await this.fileManager.processFrontMatter(file, (fm) => {
			rewriteFrontmatterValues(fm, target, (link) => {
				if (isMergePath) {
					const realFile = this.vault.getAbstractFileByPath(newName);
					if (realFile !== null) {
						return this.fileManager.generateMarkdownLink(realFile, file.path);
					}
				}
				return rewriteTarget(link, newName);
			});
		});
	}

	private async applyFrontmatterAlias(
		file: TFileMinimal,
		target: string,
		realTarget: string,
	): Promise<void> {
		const cache = this.metadataCache.getFileCache(file);
		if (cache === null || !hasFrontmatterLinks(cache, target)) return;

		await this.fileManager.processFrontMatter(file, (fm) => {
			rewriteFrontmatterValues(fm, target, (link) => toAlias(link, realTarget));
		});
	}

	private async applyFrontmatterDelete(
		file: TFileMinimal,
		target: string,
	): Promise<void> {
		const cache = this.metadataCache.getFileCache(file);
		if (cache === null || !hasFrontmatterLinks(cache, target)) return;

		await this.fileManager.processFrontMatter(file, (fm) => {
			rewriteFrontmatterValues(fm, target, (link) => removeLink(link));
		});
	}

	// ---------------------------------------------------------------------------
	// Private — scope helpers
	// ---------------------------------------------------------------------------

	/**
	 * Re-resolve source paths at call time (not cached from preview).
	 */
	private resolveSourcePaths(target: string, scope: RewriteScope): string[] {
		const dangling = this.index.danglingFor(target);
		if (dangling === null) return [];
		return filterOccurrences(dangling.occurrences, scope).map((o) => o.sourcePath);
	}

	/**
	 * Filter sourcePaths to the currently active note only.
	 * No active note → nothing in scope (returning all would unsafely rewrite the whole vault).
	 */
	private filterToActiveNote(sourcePaths: string[]): string[] {
		const activeFile = this.workspace.getActiveFile();
		if (activeFile === null) return [];
		return sourcePaths.filter((p) => p === activeFile.path);
	}
}

// ---------------------------------------------------------------------------
// Private module-level helpers
// ---------------------------------------------------------------------------

import type { DanglingOccurrence } from "types/index";

function filterOccurrences(
	occurrences: DanglingOccurrence[],
	scope: RewriteScope,
): DanglingOccurrence[] {
	if (scope.folder === undefined) return occurrences;
	const prefix = scope.folder + "/";
	return occurrences.filter((o) => o.sourcePath.startsWith(prefix));
}

function collectBodyEntries(
	cache: FileCache,
): Array<{ position: { start: { offset: number }; end: { offset: number } } }> {
	const links = cache.links ?? [];
	const embeds = cache.embeds ?? [];
	return [...links, ...embeds];
}

function hasFrontmatterLinks(cache: FileCache, target: string): boolean {
	const fmLinks = cache.frontmatterLinks ?? [];
	return fmLinks.some((fl) => fl.link.toLowerCase() === target.toLowerCase());
}

/**
 * Walk all string values in a frontmatter record and rewrite those that
 * contain wikilinks matching `target`.
 */
function rewriteFrontmatterValues(
	fm: Record<string, unknown>,
	target: string,
	transform: (link: ParsedLink) => string,
): void {
	for (const key of Object.keys(fm)) {
		const value = fm[key];
		if (typeof value === "string") {
			fm[key] = rewriteWikilinksInString(value, target, transform);
		} else if (Array.isArray(value)) {
			fm[key] = (value as unknown[]).map((item: unknown) =>
				typeof item === "string"
					? rewriteWikilinksInString(item, target, transform)
					: item,
			);
		}
	}
}

/**
 * Find and rewrite all wikilinks matching `target` inside a string value,
 * using the same descending-offset splice strategy.
 */
function rewriteWikilinksInString(
	value: string,
	target: string,
	transform: (link: ParsedLink) => string,
): string {
	const wikilinkRe = /!?\[\[[^\]]*\]\]/g;
	const hits: Array<{ start: number; end: number }> = [];
	let match: RegExpExecArray | null;
	while ((match = wikilinkRe.exec(value)) !== null) {
		const parsed = parseLinkAtOffset(value, match.index, match.index + match[0].length);
		if (targetMatches(parsed, target)) {
			hits.push({ start: match.index, end: match.index + match[0].length });
		}
	}
	hits.sort((a, b) => b.start - a.start);
	let out = value;
	for (const hit of hits) {
		const parsed = parseLinkAtOffset(out, hit.start, hit.end);
		const replacement = transform(parsed);
		out = out.slice(0, hit.start) + replacement + out.slice(hit.end);
	}
	return out;
}

function basenameFromPath(filePath: string): string {
	const lastSlash = filePath.lastIndexOf("/");
	const filename = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
	const lastDot = filename.lastIndexOf(".");
	return lastDot === -1 ? filename : filename.slice(0, lastDot);
}

/**
 * Yield control to the event loop so the browser/renderer can process pending
 * UI events between bulk-file iterations (Gap E / SDD §575).
 * Uses a `setTimeout(0)` macrotask so DOM updates are visible between chunks.
 */
function yieldToEventLoop(): Promise<void> {
	return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}
