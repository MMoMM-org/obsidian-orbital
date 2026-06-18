import type { TFile, MetadataCache } from "obsidian";

/**
 * ExclusionMatcher — pure, stateless file exclusion check.
 *
 * Constructed once from two string arrays:
 *   pathPatterns  — JavaScript regex strings tested against `file.path`.
 *   tagPatterns   — JavaScript regex strings tested against each individual
 *                   tag in `frontmatter.tags` (string or string[]).
 *
 * Semantics:
 *   - A file is excluded when ANY path pattern OR any tag pattern matches.
 *   - An invalid regex is silently skipped (treated as no-match, never throws).
 *   - Empty pattern arrays exclude nothing.
 *   - Tag matching is per-tag (not a comma-joined blob) to avoid over-matching.
 */
export class ExclusionMatcher {
	private readonly pathRegexes: RegExp[];
	private readonly tagRegexes: RegExp[];

	constructor(pathPatterns: string[], tagPatterns: string[]) {
		this.pathRegexes = compilePatterns(pathPatterns);
		this.tagRegexes = compilePatterns(tagPatterns);
	}

	isExcluded(file: TFile, cache: MetadataCache): boolean {
		return this.matchesPath(file.path) || this.matchesTags(file, cache);
	}

	private matchesPath(filePath: string): boolean {
		return this.pathRegexes.some((re) => re.test(filePath));
	}

	private matchesTags(file: TFile, cache: MetadataCache): boolean {
		if (this.tagRegexes.length === 0) return false;
		const tags = resolveTags(cache, file);
		return tags.some((tag) => this.tagRegexes.some((re) => re.test(tag)));
	}
}

/** Compile pattern strings into RegExp objects, silently dropping invalid ones. */
function compilePatterns(patterns: string[]): RegExp[] {
	const result: RegExp[] = [];
	for (const pattern of patterns) {
		try {
			result.push(new RegExp(pattern));
		} catch {
			console.debug(`[ExclusionMatcher] skipping invalid pattern: ${pattern}`);
		}
	}
	return result;
}

/**
 * Normalise `frontmatter.tags` to a string array.
 *
 * Obsidian frontmatter allows tags as either a YAML scalar (string) or a
 * YAML sequence (string[]). Both forms are handled; anything else yields [].
 */
function resolveTags(cache: MetadataCache, file: TFile): string[] {
	const raw: unknown = cache.getFileCache(file)?.frontmatter?.["tags"];
	if (Array.isArray(raw)) {
		return raw.filter((t): t is string => typeof t === "string");
	}
	if (typeof raw === "string") {
		return [raw];
	}
	return [];
}
