/**
 * T2.3 — RelationsPanel unit tests
 *
 * Tests cover:
 * - 4 collapsible sections render (Outgoing, Backlinks, 2nd-hop, Missing)
 * - Count badges shown when showCounts=true, omitted when showCounts=false
 * - Click on resolved item → getLeaf(false).openLinkText (Keymap.isModEvent=false)
 * - Click with Keymap.isModEvent=true → getLeaf(true).openLinkText
 * - Mouseover on item → workspace.trigger('hover-link', { source:'orbit', ... })
 * - Missing section 'Manage →' button calls onManage(target)
 * - Empty state when activePath is null
 * - Collapse toggle persists via setCollapsed / getCollapsed
 * - Truncation indicator shown when result.truncated=true
 *
 * TDD: these tests were written BEFORE the implementation (RED phase).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Keymap, augmentEl } from "../../__mocks__/obsidian";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { MetadataCache as IndexMetadataCache } from "graph/LinkGraphIndex";
import { RelationsPanel } from "view/panels/RelationsPanel";
import type { RelationsPanelDeps, RelationsPanelApp } from "view/panels/RelationsPanel";
import type { UnlinkedMentionGroup } from "graph/unlinkedMentions";
import type { OrbitSettings } from "types/index";
import { DEFAULT_SETTINGS } from "types/index";

// ---------------------------------------------------------------------------
// Unlinked-mentions fixtures + a no-op mentions dep for tests that ignore it
// ---------------------------------------------------------------------------

function makeGroup(
	path: string,
	overrides?: Partial<UnlinkedMentionGroup>,
): UnlinkedMentionGroup {
	const display = path.replace(/^.*\//, "").replace(/\.md$/, "");
	return {
		path,
		display,
		alreadyLinks: false,
		matches: [
			{
				start: 0,
				end: 4,
				matchedText: "Note",
				snippet: { before: "see ", hit: "Note", after: " here" },
			},
		],
		...overrides,
	};
}

function nullMentions(): RelationsPanelDeps["mentions"] {
	return {
		peek: () => null,
		computeGroups: async () => [],
		linkMentions: async () => 0,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(overrides?: Partial<OrbitSettings>): OrbitSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

function buildIndexCache(
	resolved: Record<string, Record<string, number>> = {},
	unresolved: Record<string, Record<string, number>> = {},
): IndexMetadataCache {
	const app = new App();
	app.metadataCache.resolvedLinks = resolved;
	app.metadataCache.unresolvedLinks = unresolved;
	return app.metadataCache as unknown as IndexMetadataCache;
}

function buildIndex(
	resolved: Record<string, Record<string, number>> = {},
	unresolved: Record<string, Record<string, number>> = {},
): LinkGraphIndex {
	const cache = buildIndexCache(resolved, unresolved);
	const idx = new LinkGraphIndex(cache);
	idx.buildFull();
	return idx;
}

function makeContainer(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

type MakeDepsOptions = {
	settings?: Partial<OrbitSettings>;
	resolved?: Record<string, Record<string, number>>;
	unresolved?: Record<string, Record<string, number>>;
	isExcluded?: (path: string) => boolean;
	onManage?: (target: string) => void;
	collapsed?: string[];
	/** Pre-seeded cached unlinked-mention groups (peek returns these). */
	mentionGroups?: UnlinkedMentionGroup[];
};

function makeDeps(opts: MakeDepsOptions = {}): RelationsPanelDeps & {
	appInstance: App;
	collapsedState: string[];
	onManageFn: ReturnType<typeof vi.fn>;
	mentionsMock: {
		peek: ReturnType<typeof vi.fn>;
		computeGroups: ReturnType<typeof vi.fn>;
		linkMentions: ReturnType<typeof vi.fn>;
	};
	requestRefreshFn: ReturnType<typeof vi.fn>;
} {
	const appInstance = new App();
	const resolved = opts.resolved ?? {};
	const unresolved = opts.unresolved ?? {};
	appInstance.metadataCache.resolvedLinks = resolved;
	appInstance.metadataCache.unresolvedLinks = unresolved;

	const index = buildIndex(resolved, unresolved);
	const settings = makeSettings(opts.settings);
	const collapsedState: string[] = [...(opts.collapsed ?? [])];
	const onManageFn = vi.fn(opts.onManage ?? ((_target: string) => {}));
	const registerDomEvent = vi.fn(
		<K extends keyof HTMLElementEventMap>(
			el: HTMLElement,
			type: K,
			handler: (ev: HTMLElementEventMap[K]) => void,
		) => {
			el.addEventListener(type, handler as EventListener);
		},
	);

	const cachedGroups = opts.mentionGroups;
	const mentionsMock = {
		peek: vi.fn(() => cachedGroups ?? null),
		computeGroups: vi.fn(async () => cachedGroups ?? []),
		linkMentions: vi.fn(async () => 1),
	};
	const requestRefreshFn = vi.fn();

	const deps: RelationsPanelDeps = {
		index,
		getSettings: () => settings,
		app: appInstance as unknown as RelationsPanelApp,
		isExcluded: opts.isExcluded ?? ((_path: string) => false),
		onManage: onManageFn,
		mentions: mentionsMock,
		requestRefresh: requestRefreshFn,
		getCollapsed: () => [...collapsedState],
		setCollapsed: (keys: string[]) => {
			collapsedState.length = 0;
			collapsedState.push(...keys);
		},
		registerDomEvent,
	};

	return { ...deps, appInstance, collapsedState, onManageFn, mentionsMock, requestRefreshFn };
}

// ---------------------------------------------------------------------------
// Section rendering
// ---------------------------------------------------------------------------

describe("RelationsPanel section rendering", () => {
	it("renders five sections when active note has links", () => {
		const { ...deps } = makeDeps({
			resolved: {
				"notes/active.md": { "notes/target.md": 1 },
				"notes/source.md": { "notes/active.md": 1 },
			},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const sections = container.querySelectorAll(".orbit-relations-section");
		expect(sections.length).toBe(5);
	});

	it("section headers are labelled Outgoing, Backlinks, 2nd hop, Unlinked mentions, Missing", () => {
		const { ...deps } = makeDeps({
			resolved: {
				"notes/active.md": { "notes/target.md": 1 },
			},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		// Query the label spans specifically so count badges don't pollute textContent
		const labels = Array.from(
			container.querySelectorAll(".orbit-relations-section-label"),
		).map((el) => el.textContent?.trim() ?? "");

		expect(labels).toContain("Outgoing");
		expect(labels).toContain("Backlinks");
		expect(labels.some((l) => l.includes("2nd hop"))).toBe(true);
		expect(labels).toContain("Unlinked mentions");
		expect(labels).toContain("Missing");
	});

	it("places Unlinked mentions between 2nd hop and Missing", () => {
		const { ...deps } = makeDeps({
			resolved: { "notes/active.md": { "notes/target.md": 1 } },
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const order = Array.from(
			container.querySelectorAll(".orbit-relations-section"),
		).map((el) => el.getAttribute("data-section"));
		expect(order).toEqual([
			"outgoing",
			"backlinks",
			"secondHop",
			"unlinkedMentions",
			"missing",
		]);
	});

	it("count badges are rendered when showCounts=true", () => {
		const { ...deps } = makeDeps({
			settings: { showCounts: true },
			resolved: {
				"notes/active.md": { "notes/target.md": 1 },
			},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const badges = container.querySelectorAll(".orbit-relations-count");
		expect(badges.length).toBeGreaterThan(0);
	});

	it("count badges are not rendered when showCounts=false", () => {
		const { ...deps } = makeDeps({
			settings: { showCounts: false },
			resolved: {
				"notes/active.md": { "notes/target.md": 1 },
			},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const badges = container.querySelectorAll(".orbit-relations-count");
		expect(badges.length).toBe(0);
	});

	it("outgoing section shows the target note as a row", () => {
		const { ...deps } = makeDeps({
			resolved: {
				"notes/active.md": { "notes/target.md": 1 },
			},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const rows = container.querySelectorAll(".orbit-relations-item");
		const texts = Array.from(rows).map((r) => r.textContent?.trim() ?? "");
		expect(texts.some((t) => t.includes("target"))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

describe("RelationsPanel empty states", () => {
	it("renders an empty-state message when activePath is null", () => {
		const { ...deps } = makeDeps();
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, null);

		const emptyState = container.querySelector(".orbit-relations-empty");
		expect(emptyState).not.toBeNull();
		expect(emptyState?.textContent).toMatch(/no file open/i);
	});

	it("does not render sections when activePath is null", () => {
		const { ...deps } = makeDeps();
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, null);

		const sections = container.querySelectorAll(".orbit-relations-section");
		expect(sections.length).toBe(0);
	});

	it("still renders 5 sections (with 0 counts) when note has no links", () => {
		const { ...deps } = makeDeps({
			resolved: {},
			unresolved: {},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/empty.md");

		const sections = container.querySelectorAll(".orbit-relations-section");
		expect(sections.length).toBe(5);
	});

	it("omits the Unlinked mentions section when the setting is disabled", () => {
		const { ...deps } = makeDeps({
			settings: { unlinkedMentionsEnabled: false },
			resolved: { "notes/active.md": { "notes/target.md": 1 } },
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const unlinked = container.querySelector(
			".orbit-relations-section[data-section='unlinkedMentions']",
		);
		expect(unlinked).toBeNull();
		expect(container.querySelectorAll(".orbit-relations-section").length).toBe(4);
	});
});

// ---------------------------------------------------------------------------
// Navigation: click to open
// ---------------------------------------------------------------------------

describe("RelationsPanel click navigation", () => {
	it("clicking a resolved item calls getLeaf(false) then openLinkText", () => {
		vi.mocked(Keymap.isModEvent).mockReturnValue(false);

		const appInstance = new App();
		appInstance.metadataCache.resolvedLinks = {
			"notes/active.md": { "notes/target.md": 1 },
		};
		const index = buildIndex({ "notes/active.md": { "notes/target.md": 1 } });
		const mockLeaf = { openLinkText: vi.fn(async () => {}) };
		(appInstance.workspace.getLeaf as ReturnType<typeof vi.fn>).mockReturnValue(mockLeaf);

		const collapsedState: string[] = [];
		const deps: RelationsPanelDeps = {
			index,
			getSettings: () => makeSettings({ showCounts: true }),
			app: appInstance as unknown as RelationsPanelApp,
			isExcluded: () => false,
			onManage: vi.fn(),
			mentions: nullMentions(),
			requestRefresh: vi.fn(),
			getCollapsed: () => [...collapsedState],
			setCollapsed: (keys) => { collapsedState.length = 0; collapsedState.push(...keys); },
			registerDomEvent: vi.fn((el, type, handler) => {
				el.addEventListener(type, handler as EventListener);
			}),
		};

		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const row = container.querySelector(".orbit-relations-item") as HTMLElement;
		expect(row).not.toBeNull();
		row.click();

		expect(appInstance.workspace.getLeaf).toHaveBeenCalledWith(false);
		expect(mockLeaf.openLinkText).toHaveBeenCalledWith(
			"notes/target.md",
			"notes/active.md",
			false,
		);

		vi.mocked(Keymap.isModEvent).mockReset();
	});

	it("clicking a resolved item with Keymap.isModEvent=true calls getLeaf(true)", () => {
		vi.mocked(Keymap.isModEvent).mockReturnValue(true);

		const appInstance = new App();
		appInstance.metadataCache.resolvedLinks = {
			"notes/active.md": { "notes/target.md": 1 },
		};
		const index = buildIndex({ "notes/active.md": { "notes/target.md": 1 } });
		const mockLeaf = { openLinkText: vi.fn(async () => {}) };
		(appInstance.workspace.getLeaf as ReturnType<typeof vi.fn>).mockReturnValue(mockLeaf);

		const collapsedState: string[] = [];
		const deps: RelationsPanelDeps = {
			index,
			getSettings: () => makeSettings(),
			app: appInstance as unknown as RelationsPanelApp,
			isExcluded: () => false,
			onManage: vi.fn(),
			mentions: nullMentions(),
			requestRefresh: vi.fn(),
			getCollapsed: () => [...collapsedState],
			setCollapsed: (keys) => { collapsedState.length = 0; collapsedState.push(...keys); },
			registerDomEvent: vi.fn((el, type, handler) => {
				el.addEventListener(type, handler as EventListener);
			}),
		};

		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const row = container.querySelector(".orbit-relations-item") as HTMLElement;
		row.click();

		expect(appInstance.workspace.getLeaf).toHaveBeenCalledWith(true);
		expect(mockLeaf.openLinkText).toHaveBeenCalledWith(
			"notes/target.md",
			"notes/active.md",
			true,
		);

		vi.mocked(Keymap.isModEvent).mockReset();
	});
});

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

describe("RelationsPanel hover", () => {
	it("mouseover on a resolved item triggers workspace.trigger('hover-link', ...) with source 'orbit'", () => {
		const appInstance = new App();
		appInstance.metadataCache.resolvedLinks = {
			"notes/active.md": { "notes/target.md": 1 },
		};
		const index = buildIndex({ "notes/active.md": { "notes/target.md": 1 } });

		const collapsedState: string[] = [];
		const deps: RelationsPanelDeps = {
			index,
			getSettings: () => makeSettings(),
			app: appInstance as unknown as RelationsPanelApp,
			isExcluded: () => false,
			onManage: vi.fn(),
			mentions: nullMentions(),
			requestRefresh: vi.fn(),
			getCollapsed: () => [...collapsedState],
			setCollapsed: (keys) => { collapsedState.length = 0; collapsedState.push(...keys); },
			registerDomEvent: vi.fn((el, type, handler) => {
				el.addEventListener(type, handler as EventListener);
			}),
		};

		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const row = container.querySelector(".orbit-relations-item") as HTMLElement;
		row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

		expect(appInstance.workspace.trigger).toHaveBeenCalledWith(
			"hover-link",
			expect.objectContaining({
				source: "orbit",
				linktext: "notes/target.md",
				sourcePath: "notes/active.md",
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// Missing section
// ---------------------------------------------------------------------------

describe("RelationsPanel Missing section", () => {
	it("Missing section renders a 'Manage →' control for each missing target", () => {
		const { ...deps } = makeDeps({
			unresolved: { "notes/active.md": { "[[Missing Note]]": 1 } },
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const manageBtn = container.querySelector("[aria-label='Manage missing link']");
		expect(manageBtn).not.toBeNull();
	});

	it("clicking 'Manage →' calls onManage with the target string", () => {
		const deps = makeDeps({
			unresolved: { "notes/active.md": { "[[Missing Note]]": 1 } },
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const manageBtn = container.querySelector("[aria-label='Manage missing link']") as HTMLElement;
		manageBtn.click();

		expect(deps.onManageFn).toHaveBeenCalledWith("[[Missing Note]]");
	});

	it("clicking 'Manage →' calls onManage with correct target when multiple missing", () => {
		const deps = makeDeps({
			unresolved: {
				"notes/active.md": { "alpha": 1, "beta": 2 },
			},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const manageBtns = container.querySelectorAll("[aria-label='Manage missing link']");
		expect(manageBtns.length).toBe(2);

		const targetTexts = Array.from(
			container.querySelectorAll(".orbit-relations-missing-target"),
		).map((el) => el.textContent?.trim() ?? "");
		expect(targetTexts).toContain("alpha");
		expect(targetTexts).toContain("beta");
	});
});

// ---------------------------------------------------------------------------
// Collapse state
// ---------------------------------------------------------------------------

describe("RelationsPanel collapse state", () => {
	it("a section starts expanded when not in getCollapsed()", () => {
		const { ...deps } = makeDeps({ collapsed: [] });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		// The outgoing section should not have the collapsed class
		const outgoingSection = container.querySelector(
			".orbit-relations-section[data-section='outgoing']",
		);
		expect(outgoingSection?.classList.contains("is-collapsed")).toBe(false);
	});

	it("a section starts collapsed when its key is in getCollapsed()", () => {
		const { ...deps } = makeDeps({ collapsed: ["outgoing"] });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const outgoingSection = container.querySelector(
			".orbit-relations-section[data-section='outgoing']",
		);
		expect(outgoingSection?.classList.contains("is-collapsed")).toBe(true);
	});

	it("clicking a section header toggles collapsed state and calls setCollapsed", () => {
		const deps = makeDeps({ collapsed: [] });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const outgoingHeader = container.querySelector(
			".orbit-relations-section[data-section='outgoing'] .orbit-relations-section-header",
		) as HTMLElement;
		outgoingHeader.click();

		// After clicking, setCollapsed should have been called with 'outgoing' in the list
		expect(deps.collapsedState).toContain("outgoing");
	});

	it("clicking a collapsed section header removes it from collapsed state", () => {
		const deps = makeDeps({ collapsed: ["outgoing"] });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const outgoingHeader = container.querySelector(
			".orbit-relations-section[data-section='outgoing'] .orbit-relations-section-header",
		) as HTMLElement;
		outgoingHeader.click();

		expect(deps.collapsedState).not.toContain("outgoing");
	});
});

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

describe("RelationsPanel truncation", () => {
	it("shows a truncation indicator on 2nd-hop section when result.truncated=true", () => {
		// Use secondHopCap=1 with enough 2nd-hop links to trigger truncation
		const { ...deps } = makeDeps({
			settings: { secondHopEnabled: true, secondHopCap: 1 },
			resolved: {
				"notes/active.md": { "notes/hop1.md": 1 },
				"notes/hop1.md": { "notes/hop2.md": 1, "notes/hop3.md": 1 },
			},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const truncationHint = container.querySelector(".orbit-relations-truncated");
		expect(truncationHint).not.toBeNull();
	});

	it("does not show truncation indicator when result.truncated=false", () => {
		const { ...deps } = makeDeps({
			settings: { secondHopEnabled: true, secondHopCap: 50 },
			resolved: {
				"notes/active.md": { "notes/hop1.md": 1 },
			},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const truncationHint = container.querySelector(".orbit-relations-truncated");
		expect(truncationHint).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 2nd-hop grouping
// ---------------------------------------------------------------------------

describe("RelationsPanel 2nd-hop grouping", () => {
	it("renders via-group labels in the 2nd-hop section", () => {
		const { ...deps } = makeDeps({
			resolved: {
				"notes/active.md": { "notes/hop1.md": 1 },
				"notes/hop1.md": { "notes/hop2.md": 1 },
			},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const viaLabels = container.querySelectorAll(".orbit-relations-via-label");
		expect(viaLabels.length).toBeGreaterThan(0);
		expect(viaLabels[0]?.textContent).toMatch(/hop1/);
	});
});

// ---------------------------------------------------------------------------
// T5.2 — Gap D: per-section list truncation with "Show more" button
// ---------------------------------------------------------------------------

describe("RelationsPanel list truncation (Gap D)", () => {
	/**
	 * Build a large resolved-links graph: active.md → 110 different targets.
	 * These appear as outgoing links (and each target also backlinks to active.md).
	 */
	function buildLargeResolvedLinks(count: number): Record<string, Record<string, number>> {
		const links: Record<string, number> = {};
		for (let i = 0; i < count; i++) {
			links[`notes/target-${i}.md`] = 1;
		}
		return {
			"notes/active.md": links,
		};
	}

	it("renders all outgoing items when count is within cap (≤100)", () => {
		const deps = makeDeps({
			resolved: buildLargeResolvedLinks(5),
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const outgoing = container.querySelector(".orbit-relations-section[data-section='outgoing']");
		const items = outgoing?.querySelectorAll(".orbit-relations-item") ?? [];
		expect(items.length).toBe(5);
	});

	it("renders only first RENDER_CAP (~100) outgoing items when list exceeds cap", () => {
		const deps = makeDeps({
			resolved: buildLargeResolvedLinks(110),
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const outgoing = container.querySelector(".orbit-relations-section[data-section='outgoing']");
		const items = outgoing?.querySelectorAll(".orbit-relations-item") ?? [];
		expect(items.length).toBeLessThanOrEqual(100);
	});

	it("renders a 'Show more' control in outgoing section when item count exceeds cap", () => {
		const deps = makeDeps({
			resolved: buildLargeResolvedLinks(110),
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const outgoing = container.querySelector(".orbit-relations-section[data-section='outgoing']");
		const showMore = outgoing?.querySelector(".orbit-show-more");
		expect(showMore).not.toBeNull();
	});

	it("does not render 'Show more' in outgoing section when item count is within cap", () => {
		const deps = makeDeps({
			resolved: buildLargeResolvedLinks(5),
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const outgoing = container.querySelector(".orbit-relations-section[data-section='outgoing']");
		const showMore = outgoing?.querySelector(".orbit-show-more");
		expect(showMore).toBeNull();
	});

	it("clicking 'Show more' in outgoing section reveals all items", () => {
		const deps = makeDeps({
			resolved: buildLargeResolvedLinks(110),
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const outgoing = container.querySelector(".orbit-relations-section[data-section='outgoing']");
		const showMoreBtn = outgoing?.querySelector(".orbit-show-more") as HTMLElement | null;
		expect(showMoreBtn).not.toBeNull();
		showMoreBtn!.click();

		const items = outgoing?.querySelectorAll(".orbit-relations-item") ?? [];
		expect(items.length).toBe(110);
	});

	it("renders a 'Show more' control in backlinks section when backlink count exceeds cap", () => {
		// Build a graph where 110 different files each link TO active.md (backlinks).
		const resolved: Record<string, Record<string, number>> = {};
		for (let i = 0; i < 110; i++) {
			resolved[`notes/source-${i}.md`] = { "notes/active.md": 1 };
		}
		const deps = makeDeps({ resolved });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const backlinks = container.querySelector(".orbit-relations-section[data-section='backlinks']");
		expect(backlinks).not.toBeNull();
		const showMore = backlinks?.querySelector(".orbit-show-more");
		expect(showMore).not.toBeNull();
	});

	it("clicking 'Show more' in backlinks section reveals all items", () => {
		const resolved: Record<string, Record<string, number>> = {};
		for (let i = 0; i < 110; i++) {
			resolved[`notes/source-${i}.md`] = { "notes/active.md": 1 };
		}
		const deps = makeDeps({ resolved });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const backlinks = container.querySelector(".orbit-relations-section[data-section='backlinks']");
		const showMoreBtn = backlinks?.querySelector(".orbit-show-more") as HTMLElement | null;
		expect(showMoreBtn).not.toBeNull();
		showMoreBtn!.click();

		const items = backlinks?.querySelectorAll(".orbit-relations-item") ?? [];
		expect(items.length).toBe(110);
	});
});

// ---------------------------------------------------------------------------
// Unlinked mentions section
// ---------------------------------------------------------------------------

describe("RelationsPanel unlinked mentions", () => {
	function unlinkedSection(container: HTMLElement): HTMLElement | null {
		return container.querySelector(
			".orbit-relations-section[data-section='unlinkedMentions']",
		);
	}

	it("does not scan while collapsed (the default)", () => {
		const deps = makeDeps({
			collapsed: ["unlinkedMentions"],
			resolved: { "notes/active.md": { "notes/target.md": 1 } },
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const section = unlinkedSection(container);
		expect(section?.classList.contains("is-collapsed")).toBe(true);
		expect(deps.mentionsMock.computeGroups).not.toHaveBeenCalled();
		expect(section?.querySelector(".orbit-relations-mention-group")).toBeNull();
	});

	it("shows a scanning placeholder and kicks the scan when expanded without a cached result", () => {
		const deps = makeDeps({
			collapsed: [],
			resolved: { "notes/active.md": { "notes/target.md": 1 } },
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const section = unlinkedSection(container);
		expect(section?.querySelector(".orbit-relations-mention-loading")).not.toBeNull();
		expect(deps.mentionsMock.computeGroups).toHaveBeenCalledWith("notes/active.md");
	});

	it("renders a group with name, count and highlighted snippet from the cache", () => {
		const deps = makeDeps({
			collapsed: [],
			mentionGroups: [makeGroup("notes/Hub.md")],
			resolved: { "notes/active.md": { "notes/target.md": 1 } },
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const section = unlinkedSection(container)!;
		expect(section.querySelector(".orbit-relations-mention-name")?.textContent).toBe("Hub");
		expect(section.querySelector(".orbit-relations-mention-highlight")?.textContent).toBe("Note");
		expect(deps.mentionsMock.computeGroups).not.toHaveBeenCalled();
	});

	it("uses Obsidian's native search-result classes so it matches the Backlinks pane", () => {
		const deps = makeDeps({ collapsed: [], mentionGroups: [makeGroup("notes/Hub.md")] });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const section = unlinkedSection(container)!;
		expect(section.querySelector(".tree-item.search-result")).not.toBeNull();
		expect(section.querySelector(".tree-item-self.search-result-file-title")).not.toBeNull();
		expect(section.querySelector(".tree-item-icon.collapse-icon")).not.toBeNull();
		expect(section.querySelector(".tree-item-inner")).not.toBeNull();
		expect(section.querySelector(".search-result-file-matches")).not.toBeNull();
		expect(section.querySelector(".search-result-file-match")).not.toBeNull();
		expect(section.querySelector(".search-result-file-matched-text")?.textContent).toBe("Note");
		expect(section.querySelector(".search-result-file-match-replace-button")).not.toBeNull();
	});

	it("shows a 🔗 badge when the note already links the active note", () => {
		const deps = makeDeps({
			collapsed: [],
			mentionGroups: [makeGroup("notes/Hub.md", { alreadyLinks: true })],
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const badge = unlinkedSection(container)!.querySelector(
			".orbit-relations-mention-linked-badge",
		);
		expect(badge).not.toBeNull();
	});

	it("shows the total mention count in the header when cached", () => {
		const group = makeGroup("notes/Hub.md", {
			matches: [
				{ start: 0, end: 4, matchedText: "Note", snippet: { before: "", hit: "Note", after: "" } },
				{ start: 9, end: 13, matchedText: "Note", snippet: { before: "", hit: "Note", after: "" } },
			],
		});
		const deps = makeDeps({ collapsed: [], mentionGroups: [group] });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const count = unlinkedSection(container)!
			.querySelector(".orbit-relations-section-header .orbit-relations-count")?.textContent;
		expect(count).toBe("2");
	});

	it("clicking the note name opens it (new tab honouring the setting / mod key)", () => {
		vi.mocked(Keymap.isModEvent).mockReturnValue(false);
		const deps = makeDeps({
			collapsed: [],
			settings: { unlinkedOpenInNewTab: true },
			mentionGroups: [makeGroup("notes/Hub.md")],
		});
		const mockLeaf = { openLinkText: vi.fn(async () => {}) };
		(deps.appInstance.workspace.getLeaf as ReturnType<typeof vi.fn>).mockReturnValue(mockLeaf);

		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const name = unlinkedSection(container)!.querySelector(
			".orbit-relations-mention-name",
		) as HTMLElement;
		name.click();

		expect(deps.appInstance.workspace.getLeaf).toHaveBeenCalledWith(true);
		expect(mockLeaf.openLinkText).toHaveBeenCalledWith("notes/Hub.md", "notes/active.md", true);
		vi.mocked(Keymap.isModEvent).mockReset();
	});

	it("clicking the per-note Link button links all mentions in that note", () => {
		const deps = makeDeps({
			collapsed: [],
			mentionGroups: [makeGroup("notes/Hub.md")],
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const btn = unlinkedSection(container)!.querySelector(
			".orbit-relations-mention-group-header .orbit-relations-mention-link-btn",
		) as HTMLElement;
		btn.click();

		expect(deps.mentionsMock.linkMentions).toHaveBeenCalledWith("notes/active.md", "notes/Hub.md");
	});

	it("clicking a snippet Link button links only that occurrence", () => {
		const group = makeGroup("notes/Hub.md", {
			matches: [
				{ start: 7, end: 11, matchedText: "Note", snippet: { before: "", hit: "Note", after: "" } },
			],
		});
		const deps = makeDeps({ collapsed: [], mentionGroups: [group] });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const btn = unlinkedSection(container)!.querySelector(
			".orbit-relations-mention-snippet .orbit-relations-mention-link-btn",
		) as HTMLElement;
		btn.click();

		expect(deps.mentionsMock.linkMentions).toHaveBeenCalledWith(
			"notes/active.md",
			"notes/Hub.md",
			[7],
		);
	});

	it("clicking the section header toggles collapse and requests a refresh", () => {
		const deps = makeDeps({ collapsed: ["unlinkedMentions"] });
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/active.md");

		const header = unlinkedSection(container)!.querySelector(
			".orbit-relations-section-header",
		) as HTMLElement;
		header.click();

		expect(deps.collapsedState).not.toContain("unlinkedMentions");
		expect(deps.requestRefreshFn).toHaveBeenCalled();
	});
});
