/**
 * Obsidian API mock for unit testing.
 *
 * Convergent shape from Kado v0.7.x and miyo-tomo-hashi: realistic enough
 * that SettingsTab UI tests, Modal/View tests, and lifecycle/cleanup tests
 * can run without an actual Obsidian runtime. Extend as needed when adding
 * new Obsidian API usage.
 *
 * Key behaviours:
 * - augmentEl(): mounts Obsidian's `createEl/createDiv/createSpan/empty/
 *   addClass/removeClass/toggleClass` helpers onto plain DOM elements.
 * - Setting + UI components (Text/Toggle/Button/Dropdown) attach real DOM
 *   nodes and fire real events, so tests can dispatch clicks and inputs
 *   against `inputEl` / `toggleEl` / `buttonEl` / `selectEl`.
 * - Plugin: tracks register() callbacks; `_runCleanup()` simulates onunload.
 * - Notice: tracks instances via `Notice._instances` (reset with `Notice._reset()`).
 */

import { vi } from "vitest";

// --- Core types ---

export interface TagCache {
	tag: string;
	position?: unknown;
}

export interface ReferencePosition {
	start: { offset: number };
	end: { offset: number };
}

export interface ReferenceCache {
	position: ReferencePosition;
	link?: string;
	original?: string;
	displayText?: string;
}

export interface FrontmatterLinkCache {
	key: string;
	link: string;
	original: string;
	displayText?: string;
	position: ReferencePosition;
}

export interface CachedMetadata {
	tags?: TagCache[];
	frontmatter?: Record<string, unknown>;
	links?: ReferenceCache[];
	embeds?: ReferenceCache[];
	frontmatterLinks?: FrontmatterLinkCache[];
}

/** Mirrors Obsidian's ViewStateResult — passed to setState so views can signal
 *  history behaviour. */
export interface ViewStateResult {
	history: boolean;
}

// --- App & Workspace ---

export class Component {
	/**
	 * Mirrors Obsidian's Component.registerDomEvent: adds the listener to the
	 * element AND tracks it for cleanup. Using vi.fn wrapping so tests can spy
	 * on call count / arguments, while real DOM events still fire.
	 */
	registerDomEvent = vi.fn(
		<K extends keyof HTMLElementEventMap>(
			el: HTMLElement,
			type: K,
			handler: (ev: HTMLElementEventMap[K]) => void,
		) => {
			el.addEventListener(type, handler as EventListener);
			this._cleanupFns.push(() => el.removeEventListener(type, handler as EventListener));
		},
	);
	registerInterval = vi.fn();
	/**
	 * registerEvent — mirrors Obsidian's Component.registerEvent.
	 * In production this stores an EventRef for auto-cleanup; in tests it is a
	 * vi.fn() so call count and arguments can be asserted. No-op for cleanup
	 * simulation (the mock App's on() returns a plain object EventRef stub).
	 */
	registerEvent = vi.fn((_eventRef: unknown) => {});
	private _cleanupFns: Array<() => unknown> = [];

	register = vi.fn((fn: () => unknown) => {
		this._cleanupFns.push(fn);
	});

	/** Simulate Obsidian calling all registered cleanup functions (for testing onunload). */
	_runCleanup(): void {
		for (const fn of this._cleanupFns) fn();
	}
}

export class App {
	vault = {
		getRoot: vi.fn(() => new TFolder()),
		getAbstractFileByPath: vi.fn(),
		getFileByPath: vi.fn(),
		read: vi.fn(),
		cachedRead: vi.fn(),
		create: vi.fn(),
		modify: vi.fn(),
		// process: atomic read-modify-write. The transform callback receives the
		// current file content as a string and must return the new content.
		// Tests stub this via vi.mocked(app.vault.process).mockImplementation(...)
		// when they need realistic behaviour; otherwise it returns undefined.
		process: vi.fn(),
		delete: vi.fn(),
		trash: vi.fn(),
		readBinary: vi.fn(),
		createBinary: vi.fn(),
		modifyBinary: vi.fn(),
		getMarkdownFiles: vi.fn(() => [] as TFile[]),
		getFiles: vi.fn(() => [] as TFile[]),
		getAllLoadedFiles: vi.fn(() => [] as (TFile | TFolder)[]),
		adapter: {
			read: vi.fn(),
			write: vi.fn(),
			exists: vi.fn(),
			stat: vi.fn(async () => null),
			rename: vi.fn(),
			remove: vi.fn(),
		},
		configDir: ".obsidian",
		/** vault.on / vault.off — mirror Obsidian's EventRef event system. */
		on: vi.fn((_event: string, _handler: (...args: unknown[]) => unknown) => ({})),
		off: vi.fn((_event: string, _handler: (...args: unknown[]) => unknown) => {}),
	};
	fileManager = {
		processFrontMatter: vi.fn(),
		/** renameFile — moves/renames a TFile in the vault. */
		renameFile: vi.fn(async (_file: TFile, _newPath: string): Promise<void> => {}),
		/** generateMarkdownLink — produces a wikilink/markdown link string for a target file. */
		generateMarkdownLink: vi.fn(
			(_file: TFile, _sourcePath: string, _subpath?: string, _alias?: string): string => "",
		),
		/**
		 * getNewFileParent — mirrors Obsidian's FileManager.getNewFileParent.
		 * Returns the default folder for new notes. Tests can override via
		 * vi.mocked(app.fileManager.getNewFileParent).mockReturnValue(folder).
		 */
		getNewFileParent: vi.fn((_sourcePath: string): TFolder => new TFolder()),
	};
	workspace = {
		getActiveViewOfType: vi.fn(),
		on: vi.fn((_event: string, _handler: (...args: unknown[]) => unknown) => ({})),
		off: vi.fn((_event: string, _handler: (...args: unknown[]) => unknown) => {}),
		getLeavesOfType: vi.fn(() => [] as WorkspaceLeaf[]),
		getRightLeaf: vi.fn((_split: boolean) => new WorkspaceLeaf()),
		setActiveLeaf: vi.fn((_leaf: WorkspaceLeaf, _params?: { focus?: boolean }) => {}),
		openLinkText: vi.fn(async () => {}),
		/** getActiveFile — returns the currently active TFile, or null. */
		getActiveFile: vi.fn((): TFile | null => null),
		/**
		 * onLayoutReady — mirrors Obsidian's workspace.onLayoutReady.
		 * Fires the callback synchronously in tests (layout is always ready).
		 */
		onLayoutReady: vi.fn((cb: () => void) => { cb(); }),
		/**
		 * getLeaf — mirrors Obsidian's workspace.getLeaf(newLeaf?: boolean | PaneType).
		 * Returns a WorkspaceLeaf with an openLinkText stub so panel tests can assert
		 * navigation calls.
		 */
		getLeaf: vi.fn((_newLeaf?: boolean | string) => {
			const leaf = new WorkspaceLeaf();
			(leaf as WorkspaceLeaf & { openLinkText: ReturnType<typeof vi.fn> }).openLinkText =
				vi.fn(async () => {});
			return leaf;
		}),
		/**
		 * trigger — mirrors Obsidian's workspace.trigger(name, ...data).
		 * Used by panels to fire hover-link events; tests assert calls via vi.fn().
		 */
		trigger: vi.fn((_name: string, ..._data: unknown[]) => {}),
	};
	metadataCache = {
		getFileCache: vi.fn((_file: TFile): CachedMetadata | null => null),
		on: vi.fn((_event: string, _handler: (...args: unknown[]) => unknown) => ({})),
		off: vi.fn((_event: string, _handler: (...args: unknown[]) => unknown) => {}),
		/** resolvedLinks[sourcePath][destPath] = link count. */
		resolvedLinks: {} as Record<string, Record<string, number>>,
		/** unresolvedLinks[sourcePath][targetText] = link count. */
		unresolvedLinks: {} as Record<string, Record<string, number>>,
		/** Returns the TFile for a given link-path, or null if not found. */
		getFirstLinkpathDest: vi.fn(
			(_linkpath: string, _sourcePath: string): TFile | null => null,
		),
	};
}

// --- Plugin ---

export class Plugin extends Component {
	app: App;
	manifest = { id: "test-plugin", name: "Test Plugin", version: "0.0.0" };

	constructor(app?: App) {
		super();
		this.app = app ?? new App();
	}

	loadData = vi.fn(async () => ({}));
	saveData = vi.fn(async () => {});
	addRibbonIcon = vi.fn(() => document.createElement("div"));
	addStatusBarItem = vi.fn(() => augmentEl(document.createElement("div")));
	addCommand = vi.fn();
	addSettingTab = vi.fn();
	/** registerView records the factory so tests can assert registration. */
	registerView = vi.fn(
		(_type: string, _factory: (leaf: WorkspaceLeaf) => unknown) => {},
	);
	/** onLayoutReady runs the callback synchronously in tests. */
	onLayoutReady = vi.fn((cb: () => void) => {
		cb();
	});
	/** onExternalSettingsChange: called by Obsidian when settings change on disk. */
	onExternalSettingsChange?: () => void | Promise<void>;
}

// --- UI Components ---

export class Modal {
	app: App;
	contentEl: HTMLElement;
	constructor(app: App) {
		this.app = app;
		this.contentEl = augmentEl(document.createElement("div"));
	}
	open = vi.fn(() => {
		this.onOpen();
	});
	close = vi.fn(() => {
		this.onClose();
	});
	onOpen(): void {}
	onClose(): void {}
}

/**
 * FuzzySuggestModal<T> — minimal mock for fuzzy suggestion dialogs.
 * Subclasses override getItems(), getItemText(), and onChooseItem().
 * Tests can call these methods directly to simulate item selection
 * without needing a real Obsidian runtime.
 */
export class FuzzySuggestModal<T> extends Modal {
	constructor(app: App) {
		super(app);
	}

	/** Sets the placeholder text of the search input (no-op in tests). */
	setPlaceholder(_placeholder: string): void {}

	getItems(): T[] {
		return [];
	}

	getItemText(_item: T): string {
		return "";
	}

	onChooseItem(_item: T, _evt?: MouseEvent | KeyboardEvent): void {}
}

export class Notice {
	static _instances: Notice[] = [];
	constructor(
		public message: string,
		public timeout?: number,
	) {
		Notice._instances.push(this);
	}
	static _reset(): void {
		Notice._instances.length = 0;
	}
}

export class Setting {
	settingEl = document.createElement("div");
	nameEl = document.createElement("div");
	descEl = augmentEl(document.createElement("div"));
	private _containerEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this._containerEl = containerEl;
		this.settingEl.appendChild(this.nameEl);
		this.settingEl.appendChild(this.descEl);
		this._containerEl.appendChild(this.settingEl);
	}

	setName = vi.fn((name: string) => {
		this.nameEl.textContent = name;
		this.settingEl.setAttribute("data-setting-name", name);
		return this;
	});
	setDesc = vi.fn((desc: string) => {
		this.descEl.textContent = desc;
		return this;
	});
	setHeading = vi.fn(() => {
		this.settingEl.classList.add("setting-heading");
		return this;
	});
	addText = vi.fn((cb: (text: TextComponent) => void) => {
		const text = new TextComponent();
		this.settingEl.appendChild(text.inputEl);
		cb(text);
		return this;
	});
	addToggle = vi.fn((cb: (toggle: ToggleComponent) => void) => {
		const toggle = new ToggleComponent();
		this.settingEl.appendChild(toggle.toggleEl);
		cb(toggle);
		return this;
	});
	addDropdown = vi.fn((cb: (dropdown: DropdownComponent) => void) => {
		const dropdown = new DropdownComponent();
		this.settingEl.appendChild(dropdown.selectEl);
		cb(dropdown);
		return this;
	});
	addButton = vi.fn((cb: (button: ButtonComponent) => void) => {
		const button = new ButtonComponent();
		this.settingEl.appendChild(button.buttonEl);
		cb(button);
		return this;
	});
	addTextArea = vi.fn((cb: (textarea: TextAreaComponent) => void) => {
		const ta = new TextAreaComponent();
		this.settingEl.appendChild(ta.inputEl);
		cb(ta);
		return this;
	});
}

// Extend HTMLElement with Obsidian-specific DOM helpers used by setting tabs.
// Exported so component tests (e.g. HeaderSection) can build augmented
// containers without instantiating a full PluginSettingTab.
export function augmentEl(el: HTMLElement): HTMLElement {
	const any = el as unknown as Record<string, unknown>;

	any["createEl"] = (
		childTag: string,
		opts?: {
			text?: string;
			cls?: string;
			type?: string;
			placeholder?: string;
			value?: string;
			href?: string;
			attr?: Record<string, string>;
			title?: string;
		},
	): HTMLElement => {
		const child = augmentEl(document.createElement(childTag));
		if (opts?.text) child.textContent = opts.text;
		if (opts?.cls) child.className = opts.cls;
		if (opts?.type) (child as HTMLInputElement).type = opts.type;
		if (opts?.placeholder)
			(child as HTMLInputElement).placeholder = opts.placeholder;
		if (opts?.value) (child as HTMLInputElement).value = opts.value;
		if (opts?.href) (child as HTMLAnchorElement).href = opts.href;
		if (opts?.title) child.title = opts.title;
		if (opts?.attr) {
			for (const [k, v] of Object.entries(opts.attr)) child.setAttribute(k, v);
		}
		el.appendChild(child);
		return child;
	};

	any["createDiv"] = (opts?: { cls?: string; text?: string }): HTMLElement => {
		const div = augmentEl(document.createElement("div"));
		if (opts?.cls) div.className = opts.cls;
		if (opts?.text) div.textContent = opts.text;
		el.appendChild(div);
		return div;
	};

	any["createSpan"] = (opts?: { cls?: string; text?: string }): HTMLElement => {
		const span = augmentEl(document.createElement("span"));
		if (opts?.cls) span.className = opts.cls;
		if (opts?.text) span.textContent = opts.text;
		el.appendChild(span);
		return span;
	};

	any["empty"] = (): void => {
		while (el.firstChild) el.removeChild(el.firstChild);
	};

	any["addClass"] = (...classes: string[]): void => {
		el.classList.add(...classes);
	};

	any["removeClass"] = (...classes: string[]): void => {
		el.classList.remove(...classes);
	};

	any["toggleClass"] = (cls: string, force?: boolean): void => {
		el.classList.toggle(cls, force);
	};

	any["setText"] = (text: string): void => {
		el.textContent = text;
	};

	return el;
}

function makeObsidianEl(tag = "div"): HTMLElement {
	return augmentEl(document.createElement(tag));
}

export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl = makeObsidianEl("div");
	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
	}
	display() {}
	hide() {}
}

// --- UI Primitives ---

/**
 * TextComponent — exposes `inputEl` so tests can set value and fire events
 * directly. Bound via `addText(cb => cb.onChange(...))` in production code.
 */
class TextComponent {
	inputEl: HTMLInputElement;
	_onChange?: (value: string) => void;

	constructor() {
		this.inputEl = document.createElement("input");
		this.inputEl.type = "text";
	}

	setValue = vi.fn((v: string) => {
		this.inputEl.value = v;
		return this;
	});
	setPlaceholder = vi.fn((p: string) => {
		this.inputEl.placeholder = p;
		return this;
	});
	onChange = vi.fn((cb: (value: string) => void) => {
		this._onChange = cb;
		this.inputEl.addEventListener("input", () => cb(this.inputEl.value));
		return this;
	});
}

/** ToggleComponent — exposes `toggleEl` so tests can click to flip state. */
class ToggleComponent {
	toggleEl: HTMLElement;
	_value = false;
	_onChange?: (value: boolean) => void;

	constructor() {
		this.toggleEl = document.createElement("div");
		this.toggleEl.setAttribute("role", "switch");
		this.toggleEl.addEventListener("click", () => {
			this._value = !this._value;
			this.toggleEl.setAttribute("aria-checked", String(this._value));
			this._onChange?.(this._value);
		});
	}

	setValue = vi.fn((v: boolean) => {
		this._value = v;
		this.toggleEl.setAttribute("aria-checked", String(v));
		return this;
	});
	onChange = vi.fn((cb: (value: boolean) => void) => {
		this._onChange = cb;
		return this;
	});
}

/** ButtonComponent — exposes `buttonEl` so tests can dispatch real clicks. */
class ButtonComponent {
	buttonEl: HTMLButtonElement;
	_onClick?: () => void;

	constructor() {
		this.buttonEl = document.createElement("button");
		this.buttonEl.addEventListener("click", () => this._onClick?.());
	}

	setButtonText = vi.fn((text: string) => {
		this.buttonEl.textContent = text;
		return this;
	});
	setCta = vi.fn(() => {
		this.buttonEl.classList.add("mod-cta");
		return this;
	});
	setWarning = vi.fn(() => {
		this.buttonEl.classList.add("mod-warning");
		return this;
	});
	setIcon = vi.fn(() => this);
	setTooltip = vi.fn((text: string) => {
		this.buttonEl.setAttribute("aria-label", text);
		return this;
	});
	onClick = vi.fn((cb: () => void) => {
		this._onClick = cb;
		return this;
	});
}

/** TextAreaComponent — exposes `inputEl` (textarea) so tests can set value and fire events. */
class TextAreaComponent {
	inputEl: HTMLTextAreaElement;
	_onChange?: (value: string) => void;

	constructor() {
		this.inputEl = document.createElement("textarea");
	}

	setValue = vi.fn((v: string) => {
		this.inputEl.value = v;
		return this;
	});
	setPlaceholder = vi.fn((p: string) => {
		this.inputEl.placeholder = p;
		return this;
	});
	onChange = vi.fn((cb: (value: string) => void) => {
		this._onChange = cb;
		this.inputEl.addEventListener("input", () => cb(this.inputEl.value));
		return this;
	});
}

/**
 * DropdownComponent — exposes `selectEl` (an HTMLSelectElement) so tests can
 * set the value and dispatch a change event.
 */
class DropdownComponent {
	selectEl: HTMLSelectElement;
	_onChange?: (value: string) => void;

	constructor() {
		this.selectEl = document.createElement("select");
		this.selectEl.addEventListener("change", () => {
			this._onChange?.(this.selectEl.value);
		});
	}

	addOption = vi.fn((value: string, display: string) => {
		const opt = document.createElement("option");
		opt.value = value;
		opt.textContent = display;
		this.selectEl.appendChild(opt);
		return this;
	});
	setValue = vi.fn((v: string) => {
		this.selectEl.value = v;
		return this;
	});
	onChange = vi.fn((cb: (value: string) => void) => {
		this._onChange = cb;
		return this;
	});
}

/**
 * AbstractInputSuggest — minimal stub mirroring Obsidian's input-suggest base.
 * Concrete subclasses implement getSuggestions / renderSuggestion /
 * selectSuggestion; tests drive them directly. `open`/`close` are no-op spies.
 */
export abstract class AbstractInputSuggest<T> {
	app: App;
	limit = 100;
	protected textInputEl: HTMLInputElement | HTMLDivElement;

	constructor(app: App, textInputEl: HTMLInputElement | HTMLDivElement) {
		this.app = app;
		this.textInputEl = textInputEl;
	}

	protected abstract getSuggestions(query: string): T[] | Promise<T[]>;
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract selectSuggestion(value: T, evt?: MouseEvent | KeyboardEvent): void;

	setValue = vi.fn((value: string) => {
		if (this.textInputEl instanceof HTMLInputElement) this.textInputEl.value = value;
	});
	getValue = vi.fn((): string =>
		this.textInputEl instanceof HTMLInputElement ? this.textInputEl.value : "",
	);
	onSelect = vi.fn(() => this);
	open = vi.fn();
	close = vi.fn();
}

// --- Views ---

/** Minimal stub — tests construct plain objects shaped like WorkspaceLeaf. */
export class WorkspaceLeaf {
	view = {
		getViewType: vi.fn(() => "markdown"),
		file: null as TFile | null,
	};
	setViewState = vi.fn(async (_state: { type: string; active?: boolean }) => {});
}

/**
 * ItemView base class — the foundation for custom sidebar/panel views.
 * Subclasses must implement getViewType() and getDisplayText().
 * onOpen/onClose return Promises to match Obsidian's async lifecycle.
 */
export class ItemView extends Component {
	containerEl: HTMLElement;
	/** Content area that subclasses render into — mirrors real Obsidian nesting. */
	contentEl: HTMLElement;
	leaf: WorkspaceLeaf;
	/** App instance — mirrors Obsidian's ItemView.app (set by the framework). */
	app: App;

	constructor(leaf: WorkspaceLeaf) {
		super();
		this.leaf = leaf;
		this.app = new App();
		this.containerEl = augmentEl(document.createElement("div"));
		this.contentEl = augmentEl(document.createElement("div"));
		this.containerEl.appendChild(this.contentEl);
	}

	getViewType(): string {
		return "";
	}

	getDisplayText(): string {
		return "";
	}

	getIcon(): string {
		return "";
	}

	getState(): Record<string, unknown> {
		return {};
	}

	setState(_state: unknown, _result: ViewStateResult): Promise<void> {
		return Promise.resolve();
	}

	async onOpen(): Promise<void> {}

	async onClose(): Promise<void> {}
}

export class MarkdownView {
	editor = {
		replaceSelection: vi.fn(),
		getValue: vi.fn(() => ""),
		setValue: vi.fn(),
		getSelection: vi.fn(() => ""),
	};
	file: TFile | null = null;
	data = "";
	getViewData = vi.fn((): string => this.data);
	save = vi.fn(async (): Promise<void> => {});
}

export class Editor {
	replaceSelection = vi.fn();
	getValue = vi.fn(() => "");
	setValue = vi.fn();
	getSelection = vi.fn(() => "");
}

// --- File System ---

export class TFile {
	path = "test.md";
	name = "test.md";
	basename = "test";
	extension = "md";
	vault = {};
	parent: TFolder | null = null;
	stat = { ctime: 1000, mtime: 2000, size: 100 };
}

export class TFolder {
	path = "test-folder";
	name = "test-folder";
	children: (TFile | TFolder)[] = [];
}

// --- Events ---

export class Events {
	on = vi.fn();
	off = vi.fn();
	trigger = vi.fn();
}

// --- Utilities ---

export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/**
 * Platform — mirrors Obsidian's Platform namespace.
 *
 * Tests can mutate `Platform.isMobile` to simulate mobile context.
 * Reset after the test if needed (use `beforeEach` / `afterEach`).
 */
export const Platform = {
	isMobile: false,
};

export const setIcon = vi.fn((_el: HTMLElement, _iconId: string): void => {});

/** setTooltip — standalone helper; sets an aria-label so tests can assert it. */
export const setTooltip = vi.fn((el: HTMLElement, tooltip: string): void => {
	el.setAttribute("aria-label", tooltip);
});

/** addIcon — registers a custom icon by id. No-op stub in tests. */
export const addIcon = vi.fn((_iconId: string, _svgContent: string): void => {});

export const getAllTags = vi.fn(
	(_cache: CachedMetadata): string[] | null => null,
);

// --- Factories ---

export function createMockTFile(overrides?: Partial<{
	path: string;
	name: string;
	basename: string;
	extension: string;
	stat: Partial<{ ctime: number; mtime: number; size: number }>;
}>): TFile {
	const file = new TFile();
	if (overrides?.path !== undefined) file.path = overrides.path;
	if (overrides?.name !== undefined) file.name = overrides.name;
	if (overrides?.basename !== undefined) file.basename = overrides.basename;
	if (overrides?.extension !== undefined) file.extension = overrides.extension;
	if (overrides?.stat) {
		file.stat = {
			ctime: overrides.stat.ctime ?? 1000,
			mtime: overrides.stat.mtime ?? 2000,
			size: overrides.stat.size ?? 100,
		};
	}
	return file;
}

export function createMockCachedMetadata(overrides?: Partial<CachedMetadata>): CachedMetadata {
	return {
		tags: overrides?.tags ?? [],
		frontmatter: overrides?.frontmatter ?? {},
		links: overrides?.links,
		embeds: overrides?.embeds,
		frontmatterLinks: overrides?.frontmatterLinks,
	};
}

// --- Keymap ---

/**
 * Keymap — mirrors the real Obsidian Keymap namespace.
 *
 * isModEvent(evt) → boolean | "tab" | "split" | "window"
 *   In the real API, returns false when neither Cmd/Ctrl nor modifier is held,
 *   or a PaneType string when the user intends to open in a new pane.
 *   Tests set the return value via `vi.mocked(Keymap.isModEvent).mockReturnValue(...)`.
 */
export const Keymap = {
	isModEvent: vi.fn((_evt: MouseEvent | KeyboardEvent): boolean | "tab" | "split" | "window" => false),
};

// --- debounce ---

/**
 * Debouncer interface — mirrors the real Obsidian Debouncer type.
 * The function itself is callable and carries `.cancel()` and `.run()` methods.
 */
export interface Debouncer<T extends unknown[], V> {
	(...args: T): V | undefined;
	cancel(): void;
	run(): V | undefined;
}

/**
 * debounce — mirrors Obsidian's `debounce(fn, timeout?, resetTimer?)`.
 *
 * Implementation uses real setTimeout so tests can drive it with
 * vi.useFakeTimers() / vi.advanceTimersByTime(). Always trailing edge.
 * resetTimer controls whether repeated calls reset the countdown: when true
 * (Obsidian default) each new call restarts the timer; when false the timer
 * runs to completion from the first call. This mock is trailing in both cases.
 *
 * The returned function accumulates the last args; after `timeout` ms of
 * inactivity it calls the original function once (trailing). `.cancel()`
 * clears a pending timer. `.run()` fires immediately.
 *
 * Tests should use `vi.useFakeTimers()` to control the timer.
 */
export function debounce<T extends unknown[], V>(
	fn: (...args: T) => V,
	timeout = 0,
	_resetTimer = false,
): Debouncer<T, V> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let lastArgs: T | undefined;

	const debounced = (...args: T): V | undefined => {
		lastArgs = args;
		if (timer !== undefined) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = undefined;
			if (lastArgs !== undefined) {
				fn(...lastArgs);
			}
		}, timeout);
		return undefined;
	};

	debounced.cancel = (): void => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	debounced.run = (): V | undefined => {
		debounced.cancel();
		if (lastArgs !== undefined) {
			return fn(...lastArgs);
		}
		return undefined;
	};

	return debounced as Debouncer<T, V>;
}
