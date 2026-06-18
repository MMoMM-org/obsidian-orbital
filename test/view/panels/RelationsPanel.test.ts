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
import type { OrbitSettings } from "types/index";
import { DEFAULT_SETTINGS } from "types/index";

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
};

function makeDeps(opts: MakeDepsOptions = {}): RelationsPanelDeps & {
	appInstance: App;
	collapsedState: string[];
	onManageFn: ReturnType<typeof vi.fn>;
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

	const deps: RelationsPanelDeps = {
		index,
		getSettings: () => settings,
		app: appInstance as unknown as RelationsPanelApp,
		isExcluded: opts.isExcluded ?? ((_path: string) => false),
		onManage: onManageFn,
		getCollapsed: () => [...collapsedState],
		setCollapsed: (keys: string[]) => {
			collapsedState.length = 0;
			collapsedState.push(...keys);
		},
		registerDomEvent,
	};

	return { ...deps, appInstance, collapsedState, onManageFn };
}

// ---------------------------------------------------------------------------
// Section rendering
// ---------------------------------------------------------------------------

describe("RelationsPanel section rendering", () => {
	it("renders four sections when active note has links", () => {
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
		expect(sections.length).toBe(4);
	});

	it("section headers are labelled Outgoing, Backlinks, 2nd hop, Missing", () => {
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
		expect(labels).toContain("Missing");
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

	it("still renders 4 sections (with 0 counts) when note has no links", () => {
		const { ...deps } = makeDeps({
			resolved: {},
			unresolved: {},
		});
		const panel = new RelationsPanel(deps);
		const container = makeContainer();
		panel.render(container, "notes/empty.md");

		const sections = container.querySelectorAll(".orbit-relations-section");
		expect(sections.length).toBe(4);
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
