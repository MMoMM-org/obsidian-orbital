/**
 * MentionLinkService — TDD (tests written BEFORE implementation).
 *
 * The service scans the vault for unlinked mentions of the active note and
 * converts plain-text mentions into wikilinks. It is exercised here through
 * structural mocks (vault / fileManager / metadataCache / index), mirroring the
 * injection style of LinkRewriteService.
 */

import { describe, it, expect, vi } from "vitest";
import { MentionLinkService } from "links/MentionLinkService";

// ---------------------------------------------------------------------------
// Mock fixtures
// ---------------------------------------------------------------------------

interface FileFixture {
	path: string;
	content: string;
	frontmatter?: Record<string, unknown>;
}

function makeFile(path: string) {
	const lastSlash = path.lastIndexOf("/");
	const name = lastSlash === -1 ? path : path.slice(lastSlash + 1);
	const dot = name.lastIndexOf(".");
	return {
		path,
		basename: dot > 0 ? name.slice(0, dot) : name,
		extension: dot > 0 ? name.slice(dot + 1) : "",
	};
}

function buildDeps(
	files: FileFixture[],
	opts?: { backlinks?: Record<string, string[]>; excluded?: string[] },
) {
	const store = new Map(files.map((f) => [f.path, { ...f }]));
	const cachedRead = vi.fn((file: { path: string }) =>
		Promise.resolve(store.get(file.path)?.content ?? ""),
	);

	const vault = {
		getMarkdownFiles: () => files.map((f) => makeFile(f.path)),
		getFileByPath: (path: string) => (store.has(path) ? makeFile(path) : null),
		cachedRead,
		process: vi.fn(async (file: { path: string }, transform: (d: string) => string) => {
			const entry = store.get(file.path)!;
			entry.content = transform(entry.content);
			return entry.content;
		}),
	};

	const fileManager = {
		generateMarkdownLink: vi.fn(
			(file: { basename: string }, _src: string, _sub?: string, alias?: string) =>
				alias !== undefined ? `[[${file.basename}|${alias}]]` : `[[${file.basename}]]`,
		),
	};

	const metadataCache = {
		getFileCache: (file: { path: string }) => {
			const entry = store.get(file.path);
			if (entry === undefined) return null;
			return { frontmatter: entry.frontmatter };
		},
	};

	const backlinks = opts?.backlinks ?? {};
	const index = { backlinksOf: (path: string) => backlinks[path] ?? [] };

	const excluded = new Set(opts?.excluded ?? []);
	const isExcluded = (path: string) => excluded.has(path);

	const service = new MentionLinkService(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		vault as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		fileManager as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		metadataCache as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		index as any,
		isExcluded,
		{ chunkSize: 1 },
	);

	return { service, store, cachedRead, vault, fileManager };
}

// ---------------------------------------------------------------------------
// computeGroups
// ---------------------------------------------------------------------------

describe("MentionLinkService.computeGroups", () => {
	it("groups unlinked mentions per source note with snippets", async () => {
		const { service } = buildDeps([
			{ path: "Zettelkasten.md", content: "the active note" },
			{ path: "Hub.md", content: "Zettelkasten is great. Zettelkasten again." },
		]);
		const groups = await service.computeGroups("Zettelkasten.md");
		expect(groups).toHaveLength(1);
		expect(groups[0]!.path).toBe("Hub.md");
		expect(groups[0]!.matches).toHaveLength(2);
		expect(groups[0]!.matches[0]!.snippet.hit).toBe("Zettelkasten");
	});

	it("flags notes that already link to the active note", async () => {
		const { service } = buildDeps(
			[
				{ path: "Zettelkasten.md", content: "x" },
				{ path: "Hub.md", content: "Zettelkasten mention" },
				{ path: "Daily.md", content: "Zettelkasten mention" },
			],
			{ backlinks: { "Zettelkasten.md": ["Hub.md"] } },
		);
		const groups = await service.computeGroups("Zettelkasten.md");
		const hub = groups.find((g) => g.path === "Hub.md")!;
		const daily = groups.find((g) => g.path === "Daily.md")!;
		expect(hub.alreadyLinks).toBe(true);
		expect(daily.alreadyLinks).toBe(false);
	});

	it("excludes the active note itself and excluded paths", async () => {
		const { service } = buildDeps(
			[
				{ path: "Zettelkasten.md", content: "Zettelkasten self mention" },
				{ path: "Templates/T.md", content: "Zettelkasten in a template" },
				{ path: "Keep.md", content: "Zettelkasten kept" },
			],
			{ excluded: ["Templates/T.md"] },
		);
		const groups = await service.computeGroups("Zettelkasten.md");
		expect(groups.map((g) => g.path)).toEqual(["Keep.md"]);
	});

	it("matches the active note's aliases from frontmatter", async () => {
		const { service } = buildDeps([
			{
				path: "Zettelkasten.md",
				content: "x",
				frontmatter: { aliases: ["ZK", "Slip Box"] },
			},
			{ path: "Hub.md", content: "I use ZK and the Slip Box daily." },
		]);
		const groups = await service.computeGroups("Zettelkasten.md");
		expect(groups).toHaveLength(1);
		expect(groups[0]!.matches).toHaveLength(2);
	});

	it("memoizes — a second call does not re-read files", async () => {
		const { service, cachedRead } = buildDeps([
			{ path: "Zettelkasten.md", content: "x" },
			{ path: "Hub.md", content: "Zettelkasten" },
		]);
		await service.computeGroups("Zettelkasten.md");
		const callsAfterFirst = cachedRead.mock.calls.length;
		await service.computeGroups("Zettelkasten.md");
		expect(cachedRead.mock.calls.length).toBe(callsAfterFirst);
	});

	it("invalidate() forces a re-scan", async () => {
		const { service, cachedRead } = buildDeps([
			{ path: "Zettelkasten.md", content: "x" },
			{ path: "Hub.md", content: "Zettelkasten" },
		]);
		await service.computeGroups("Zettelkasten.md");
		const callsAfterFirst = cachedRead.mock.calls.length;
		service.invalidate();
		await service.computeGroups("Zettelkasten.md");
		expect(cachedRead.mock.calls.length).toBeGreaterThan(callsAfterFirst);
	});
});

// ---------------------------------------------------------------------------
// linkMentions
// ---------------------------------------------------------------------------

describe("MentionLinkService.linkMentions", () => {
	it("links every plain-text mention in a note, leaving existing links untouched", async () => {
		const { service, store } = buildDeps([
			{ path: "Zettelkasten.md", content: "x" },
			{ path: "Hub.md", content: "[[Zettelkasten]] then Zettelkasten and Zettelkasten." },
		]);
		const count = await service.linkMentions("Zettelkasten.md", "Hub.md");
		expect(count).toBe(2);
		expect(store.get("Hub.md")!.content).toBe(
			"[[Zettelkasten]] then [[Zettelkasten]] and [[Zettelkasten]].",
		);
	});

	it("links only the requested offset when offsets are supplied", async () => {
		const { service, store } = buildDeps([
			{ path: "Zettelkasten.md", content: "x" },
			{ path: "Hub.md", content: "Zettelkasten and Zettelkasten." },
		]);
		const secondOffset = "Zettelkasten and ".length;
		const count = await service.linkMentions("Zettelkasten.md", "Hub.md", [secondOffset]);
		expect(count).toBe(1);
		expect(store.get("Hub.md")!.content).toBe("Zettelkasten and [[Zettelkasten]].");
	});

	it("preserves the visible text as an alias when matching an alias", async () => {
		const { service, store } = buildDeps([
			{ path: "Zettelkasten.md", content: "x", frontmatter: { aliases: ["ZK"] } },
			{ path: "Hub.md", content: "I use ZK daily." },
		]);
		await service.linkMentions("Zettelkasten.md", "Hub.md");
		expect(store.get("Hub.md")!.content).toBe("I use [[Zettelkasten|ZK]] daily.");
	});

	it("invalidates the cache after linking", async () => {
		const { service, cachedRead, store } = buildDeps([
			{ path: "Zettelkasten.md", content: "x" },
			{ path: "Hub.md", content: "Zettelkasten" },
		]);
		await service.computeGroups("Zettelkasten.md");
		const before = cachedRead.mock.calls.length;
		store.get("Hub.md")!.content = "Zettelkasten again Zettelkasten";
		await service.linkMentions("Zettelkasten.md", "Hub.md");
		await service.computeGroups("Zettelkasten.md");
		expect(cachedRead.mock.calls.length).toBeGreaterThan(before);
	});
});
