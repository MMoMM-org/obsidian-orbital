/**
 * Relations pure functions — T2.2
 *
 * Computes the relations result for a given active note from the link graph
 * index. This module is intentionally pure: it takes all dependencies as
 * arguments and has no side effects, making it directly unit-testable.
 *
 * Exclusion is accepted as a plain `(path: string) => boolean` predicate so
 * this module does not need to import TFile or MetadataCache from Obsidian.
 * The caller is responsible for wiring the real ExclusionMatcher to a
 * path-predicate closure (e.g. via `getFirstLinkpathDest` to resolve a TFile).
 *
 * Domain rule references: docs/ai/memory/domain.md
 */

import type { LinkGraphIndex } from "graph/LinkGraphIndex";
import type {
	OrbitSettings,
	RelationItem,
	RelationsResult,
	SecondHopGroup,
} from "types/index";

/** Minimal MetadataCache subset needed by computeRelations. */
export interface RelationsMetadataCache {
	unresolvedLinks: Record<string, Record<string, number>>;
}

/** Convert a vault path to a display name (basename without extension). */
function toItem(path: string): RelationItem {
	const name = path.split("/").pop() ?? path;
	const dot = name.lastIndexOf(".");
	const display = dot > 0 ? name.slice(0, dot) : name;
	return { path, display };
}

/**
 * Compute the 2nd-hop groups from the first-hop set.
 *
 * Algorithm (from SDD):
 *   - seed `seen` with active + all 1st-hop nodes
 *   - walk each 1st-hop node in order, collecting both its backlinks and
 *     outgoing links as candidates
 *   - skip any candidate already in `seen` (global cross-hop dedup)
 *   - stop consuming candidates once the budget (cap) is exhausted
 *   - emit a group only when it has at least one item
 *
 * Returns `{ groups, truncated }`.
 */
function computeSecondHop(
	index: LinkGraphIndex,
	active: string,
	firstHop: Set<string>,
	cap: number,
	isExcluded: (path: string) => boolean,
): { groups: SecondHopGroup[]; truncated: boolean } {
	const groups: SecondHopGroup[] = [];
	const seen = new Set<string>([active, ...firstHop]);
	let budget = cap;

	for (const via of firstHop) {
		if (budget <= 0) break;
		if (isExcluded(via)) continue;

		const candidates = [
			...index.backlinksOf(via),
			...index.outgoingOf(via),
		];
		const items: RelationItem[] = [];

		for (const path of candidates) {
			if (seen.has(path)) continue;
			if (isExcluded(path)) {
				seen.add(path); // prevent re-evaluation from another via
				continue;
			}
			seen.add(path);
			items.push(toItem(path));
			if (--budget <= 0) break;
		}

		if (items.length > 0) {
			groups.push({ via: toItem(via), items });
		}

		if (budget <= 0) break;
	}

	const truncated = budget <= 0;
	return { groups, truncated };
}

/**
 * Compute the full relations result for the active note.
 *
 * @param index       - The link graph index (pre-built via buildFull/updateFile).
 * @param activePath  - The vault-relative path of the currently open note.
 * @param settings    - Plugin settings (secondHopEnabled, secondHopCap, …).
 * @param isExcluded  - Predicate returning true for paths to omit from results.
 *                      The caller wires this to ExclusionMatcher or similar.
 * @param metadataCache - Minimal cache for reading unresolvedLinks (missing targets).
 */
export function computeRelations(
	index: LinkGraphIndex,
	activePath: string,
	settings: OrbitSettings,
	isExcluded: (path: string) => boolean,
	metadataCache: RelationsMetadataCache,
): RelationsResult {
	const empty: RelationsResult = {
		outgoing: [],
		backlinks: [],
		secondHop: [],
		missing: [],
		truncated: false,
	};

	if (!activePath) return empty;

	const rawOutgoing = index.outgoingOf(activePath).filter((p) => !isExcluded(p));
	const rawBacklinks = index.backlinksOf(activePath).filter((p) => !isExcluded(p));

	const outgoing = rawOutgoing.map(toItem);
	const backlinks = rawBacklinks.map(toItem);

	const firstHop = new Set<string>([...rawOutgoing, ...rawBacklinks]);

	let secondHop: SecondHopGroup[] = [];
	let truncated = false;

	if (settings.secondHopEnabled && settings.secondHopCap > 0) {
		const result = computeSecondHop(
			index,
			activePath,
			firstHop,
			settings.secondHopCap,
			isExcluded,
		);
		secondHop = result.groups;
		truncated = result.truncated;
	}

	const rawUnresolved = metadataCache.unresolvedLinks[activePath] ?? {};
	const missing = Object.keys(rawUnresolved).map((target) => ({ target }));

	return { outgoing, backlinks, secondHop, missing, truncated };
}
