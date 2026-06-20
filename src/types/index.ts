export type DanglingGrouping = "target" | "source";
export type DanglingScope = "vault" | "folder";
export type TabId = "relations" | "dangling" | "recent";

export interface OrbitSettings {
	recentListLength: number;
	excludePathPatterns: string[];
	excludeTagPatterns: string[];
	secondHopCap: number;
	secondHopEnabled: boolean;
	refreshDebounceMs: number;
	danglingDefaultScope: DanglingScope;
	danglingGrouping: DanglingGrouping;
	newNoteFolder: string;
	defaultTab: TabId;
	showCounts: boolean;
	/** When true, Orbit emits verbose [Orbit] console.debug traces for diagnostics. */
	debugLogging: boolean;
	recentFiles: { path: string; basename: string }[];
}

export const DEFAULT_SETTINGS: OrbitSettings = {
	recentListLength: 20,
	excludePathPatterns: [],
	excludeTagPatterns: [],
	secondHopCap: 50,
	secondHopEnabled: true,
	refreshDebounceMs: 300,
	danglingDefaultScope: "vault",
	danglingGrouping: "target",
	newNoteFolder: "",
	defaultTab: "relations",
	showCounts: true,
	debugLogging: false,
	recentFiles: [],
};

// Ephemeral per-leaf view state (getState/setState, NOT saveData)
export interface OrbitViewState {
	activeTab: TabId;
	danglingScope: DanglingScope;
	danglingGrouping: DanglingGrouping;
	collapsedSections: string[];
	/** Active dangling filter target set by "Manage →" deep-link. Null means show all. */
	activeDanglingFilter: string | null;
}

// Relations query result types
export interface RelationItem { path: string; display: string; }
export interface SecondHopGroup { via: RelationItem; items: RelationItem[]; }
export interface MissingItem { target: string; }
export interface RelationsResult {
	outgoing: RelationItem[];
	backlinks: RelationItem[];
	secondHop: SecondHopGroup[];
	missing: MissingItem[];
	truncated: boolean;
}

// Dangling model
export interface DanglingOccurrence { sourcePath: string; count: number; }
export interface DanglingTarget { target: string; occurrences: DanglingOccurrence[]; totalCount: number; }
