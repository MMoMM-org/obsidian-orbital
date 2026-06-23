export type DanglingGrouping = "target" | "source";
export type DanglingScope = "vault" | "folder";
export type TabId = "relations" | "dangling" | "recent";

export interface OrbitalSettings {
	/** Number of recently visited notes to show. */
	recentListLength: number;
	/** File path patterns to exclude (one per line, plain text or regex). */
	excludePathPatterns: string[];
	/** Tag patterns to exclude (one per line, plain text or regex). */
	excludeTagPatterns: string[];
	/** Maximum number of second-hop links to display. */
	secondHopCap: number;
	/** Show links that are two hops away from the active note. */
	secondHopEnabled: boolean;
	/** Delay in milliseconds before relations refresh after a file change. */
	refreshDebounceMs: number;
	/** Whether to show dangling links for the whole vault or just the current folder. */
	danglingDefaultScope: DanglingScope;
	/** Group dangling links by their target (missing note) or by their source file. */
	danglingGrouping: DanglingGrouping;
	/** Folder for new notes created from dangling links. Leave empty to use the default location. */
	newNoteFolder: string;
	/** Which tab to show when the orbit pane opens. */
	defaultTab: TabId;
	/** Display item counts on each tab label. */
	showCounts: boolean;
	/** When true, a status-bar item shows backlink/2nd-hop counts for the active note. */
	showStatusBar: boolean;
	/** When true, the Relations tab shows an "Unlinked mentions" section. */
	unlinkedMentionsEnabled: boolean;
	/** When true, clicking an unlinked mention opens the note in a new tab. */
	unlinkedOpenInNewTab: boolean;
	/** When true, Orbital emits verbose [Orbital] console.debug traces for diagnostics. */
	debugLogging: boolean;
	/** Internal persisted state: the most-recently-visited notes list. Not user-configurable. */
	recentFiles: { path: string; basename: string }[];
}

export const DEFAULT_SETTINGS: OrbitalSettings = {
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
	showStatusBar: true,
	unlinkedMentionsEnabled: true,
	unlinkedOpenInNewTab: false,
	debugLogging: false,
	recentFiles: [],
};

// Ephemeral per-leaf view state (getState/setState, NOT saveData)
export interface OrbitalViewState {
	activeTab: TabId;
	danglingScope: DanglingScope;
	danglingGrouping: DanglingGrouping;
	collapsedSections: string[];
	/** Active dangling filter target set by "Manage →" deep-link. Null means show all. */
	activeDanglingFilter: string | null;
	/** Free-text fuzzy filter over dangling source/target. Empty means show all. */
	danglingSearchQuery: string;
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
