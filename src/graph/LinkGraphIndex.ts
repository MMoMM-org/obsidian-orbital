/**
 * LinkGraphIndex — reverse index + incremental update support.
 *
 * Maintains three internal maps:
 *   forwardIndex   Map<source, Set<dest>>      — resolved outgoing links
 *   reverseIndex   Map<dest, Set<source>>      — reverse (backlink) lookup
 *   unresolvedIndex Map<source, Map<targetText, count>> — broken links
 *
 * All public methods are O(degree of the affected file), never O(vault size),
 * with the exception of danglingFor() and danglingTargets(), which are
 * O(total unresolved links across the vault).
 *
 * The MetadataCache shape used here is a structural subset of Obsidian's
 * MetadataCache so that tests can supply a plain mock without importing
 * the Obsidian type directly.
 */

import type { DanglingOccurrence, DanglingTarget } from "types/index";

/** Structural subset of Obsidian's MetadataCache needed by this class. */
export interface MetadataCache {
	resolvedLinks: Record<string, Record<string, number>>;
	unresolvedLinks: Record<string, Record<string, number>>;
}

export class LinkGraphIndex {
	private readonly cache: MetadataCache;
	private forwardIndex = new Map<string, Set<string>>();
	private reverseIndex = new Map<string, Set<string>>();
	private unresolvedIndex = new Map<string, Map<string, number>>();

	constructor(metadataCache: MetadataCache) {
		this.cache = metadataCache;
	}

	/** Rebuild all three indexes from scratch using current cache state. */
	buildFull(): void {
		this.forwardIndex.clear();
		this.reverseIndex.clear();
		this.unresolvedIndex.clear();

		for (const [source, dests] of Object.entries(this.cache.resolvedLinks)) {
			this.setForwardEdges(source, Object.keys(dests));
		}

		for (const [source, targets] of Object.entries(this.cache.unresolvedLinks)) {
			this.setUnresolvedEdges(source, targets);
		}
	}

	/**
	 * Incrementally update edges for a single file.
	 * Removes stale edges then adds new ones — O(degree of path).
	 */
	updateFile(path: string): void {
		this.removeForwardEdges(path);
		this.removeUnresolvedEdges(path);

		const newDests = Object.keys(this.cache.resolvedLinks[path] ?? {});
		this.setForwardEdges(path, newDests);

		const newUnresolved = this.cache.unresolvedLinks[path] ?? {};
		this.setUnresolvedEdges(path, newUnresolved);
	}

	/** Remove all edges where `path` is the source. */
	removeFile(path: string): void {
		this.removeForwardEdges(path);
		this.removeUnresolvedEdges(path);
		// Also remove path as a dest key from the reverse index if it exists
		this.reverseIndex.delete(path);
	}

	/**
	 * Rename a file: retarget source key (when source is renamed) and dest keys
	 * (when a destination is renamed) across all indexes.
	 */
	renameFile(oldPath: string, newPath: string): void {
		// Retarget as source in forward + unresolved indexes
		const oldDests = this.forwardIndex.get(oldPath);
		if (oldDests !== undefined) {
			this.forwardIndex.delete(oldPath);
			this.forwardIndex.set(newPath, oldDests);
			// Fix reverse edges: swap oldPath → newPath in each dest's source set
			for (const dest of oldDests) {
				const sources = this.reverseIndex.get(dest);
				if (sources !== undefined) {
					sources.delete(oldPath);
					sources.add(newPath);
				}
			}
		}

		const oldUnresolved = this.unresolvedIndex.get(oldPath);
		if (oldUnresolved !== undefined) {
			this.unresolvedIndex.delete(oldPath);
			this.unresolvedIndex.set(newPath, oldUnresolved);
		}

		// Retarget as dest in reverse + forward indexes
		const oldSources = this.reverseIndex.get(oldPath);
		if (oldSources !== undefined) {
			this.reverseIndex.delete(oldPath);
			this.reverseIndex.set(newPath, oldSources);
			// Fix forward edges: swap oldPath → newPath in each source's dest set
			for (const source of oldSources) {
				const dests = this.forwardIndex.get(source);
				if (dests !== undefined) {
					dests.delete(oldPath);
					dests.add(newPath);
				}
			}
		}
	}

	/** Returns all paths that link TO `path`. O(degree). Never throws. */
	backlinksOf(path: string): string[] {
		const sources = this.reverseIndex.get(path);
		return sources !== undefined ? Array.from(sources) : [];
	}

	/** Returns all paths that `path` links to. O(degree). Never throws. */
	outgoingOf(path: string): string[] {
		const dests = this.forwardIndex.get(path);
		return dests !== undefined ? Array.from(dests) : [];
	}

	/**
	 * Aggregate all unresolved targets into DanglingTarget entries.
	 * When scope.folder is set, only sources under that folder prefix are included.
	 */
	danglingTargets(scope: { folder?: string }): DanglingTarget[] {
		const grouped = new Map<string, DanglingOccurrence[]>();

		for (const [source, targets] of this.unresolvedIndex) {
			if (scope.folder !== undefined && !source.startsWith(scope.folder + "/")) {
				continue;
			}
			for (const [target, count] of targets) {
				let occurrences = grouped.get(target);
				if (occurrences === undefined) {
					occurrences = [];
					grouped.set(target, occurrences);
				}
				occurrences.push({ sourcePath: source, count });
			}
		}

		const result: DanglingTarget[] = [];
		for (const [target, occurrences] of grouped) {
			const totalCount = occurrences.reduce((sum, o) => sum + o.count, 0);
			result.push({ target, occurrences, totalCount });
		}
		return result;
	}

	/** Returns the DanglingTarget for `target`, or null if not found. */
	danglingFor(target: string): DanglingTarget | null {
		const all = this.danglingTargets({});
		return all.find((d) => d.target === target) ?? null;
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	/** Set forward edges for source and add reverse edges for each dest. */
	private setForwardEdges(source: string, dests: string[]): void {
		if (dests.length === 0) return;
		const destSet = new Set<string>(dests);
		this.forwardIndex.set(source, destSet);
		for (const dest of destSet) {
			let sources = this.reverseIndex.get(dest);
			if (sources === undefined) {
				sources = new Set();
				this.reverseIndex.set(dest, sources);
			}
			sources.add(source);
		}
	}

	/** Remove all forward edges for source and clean up reverse edges. */
	private removeForwardEdges(source: string): void {
		const oldDests = this.forwardIndex.get(source);
		if (oldDests === undefined) return;
		for (const dest of oldDests) {
			const sources = this.reverseIndex.get(dest);
			if (sources !== undefined) {
				sources.delete(source);
				if (sources.size === 0) {
					this.reverseIndex.delete(dest);
				}
			}
		}
		this.forwardIndex.delete(source);
	}

	/** Set unresolved edges for source from a targets map. */
	private setUnresolvedEdges(
		source: string,
		targets: Record<string, number>,
	): void {
		const entries = Object.entries(targets);
		if (entries.length === 0) return;
		this.unresolvedIndex.set(source, new Map(entries));
	}

	/** Remove all unresolved edges for source. */
	private removeUnresolvedEdges(source: string): void {
		this.unresolvedIndex.delete(source);
	}
}
