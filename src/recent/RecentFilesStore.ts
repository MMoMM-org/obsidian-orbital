import type { OrbitSettings } from "types/index";

/** Entry shape mirroring OrbitSettings.recentFiles. */
export type RecentFileEntry = { path: string; basename: string };

/**
 * Injectable dependencies for RecentFilesStore.
 *
 * Keeping persistence and exclusion as plain callbacks means the store
 * never imports Obsidian directly and is trivially testable with mocks.
 */
export interface RecentFilesStoreDeps {
	/** Returns the live settings object — read on every mutation so changes to
	 *  recentListLength or recentFiles take effect immediately. */
	getSettings: () => OrbitSettings;
	/** Persists the settings object to disk (plugin.saveSettings). */
	saveSettings: () => Promise<void>;
	/** Returns true when a file at the given path should be excluded from recents. */
	isExcluded: (path: string) => boolean;
}

/**
 * RecentFilesStore — MRU list for recently opened files.
 *
 * The list IS settings.recentFiles (no parallel store). All mutations update
 * that array in-place and call saveSettings() so the list survives reload.
 */
export class RecentFilesStore {
	private readonly deps: RecentFilesStoreDeps;

	constructor(deps: RecentFilesStoreDeps) {
		this.deps = deps;
	}

	/**
	 * Returns a readonly snapshot of the current recent-files list, capped to
	 * the current recentListLength setting. This ensures the panel immediately
	 * reflects setting changes (e.g. reduced length) without requiring a reload.
	 */
	list(): readonly RecentFileEntry[] {
		const settings = this.deps.getSettings();
		return settings.recentFiles.slice(0, settings.recentListLength);
	}

	/**
	 * Record a file-open event. Prepends the file to the front of the list,
	 * removes any existing entry for the same path (dedup), prunes to the
	 * current recentListLength cap, then persists.
	 *
	 * Excluded paths are silently ignored.
	 */
	async onFileOpen(path: string, basename: string): Promise<void> {
		if (this.deps.isExcluded(path)) return;

		const settings = this.deps.getSettings();
		const filtered = settings.recentFiles.filter((f) => f.path !== path);
		filtered.unshift({ path, basename });
		settings.recentFiles = filtered.slice(0, settings.recentListLength);

		await this.deps.saveSettings();
	}

	/**
	 * Update path and basename for a renamed file. The entry's position in
	 * the list is preserved. No-op when the old path is not present.
	 */
	async rename(oldPath: string, newPath: string, newBasename: string): Promise<void> {
		const settings = this.deps.getSettings();
		const idx = settings.recentFiles.findIndex((f) => f.path === oldPath);
		if (idx === -1) return;

		settings.recentFiles[idx] = { path: newPath, basename: newBasename };
		await this.deps.saveSettings();
	}

	/**
	 * Remove a deleted file from the list. No-op when the path is not present.
	 */
	async delete(path: string): Promise<void> {
		const settings = this.deps.getSettings();
		const next = settings.recentFiles.filter((f) => f.path !== path);
		if (next.length === settings.recentFiles.length) return;

		settings.recentFiles = next;
		await this.deps.saveSettings();
	}

	/**
	 * Explicitly remove a single entry from the list by path. Persists if found.
	 * Semantic alias for delete() — useful for user-triggered removal.
	 */
	async removeOne(path: string): Promise<void> {
		return this.delete(path);
	}

	/** Clear the entire list and persist. */
	async clear(): Promise<void> {
		this.deps.getSettings().recentFiles = [];
		await this.deps.saveSettings();
	}
}
