/**
 * createNote — T3.3
 *
 * Resolves the destination folder for a new note and calls vault.create.
 *
 * Folder resolution priority:
 *   1. pickerFolder — user-chosen via NotePickerModal
 *   2. settings.newNoteFolder — configured default (non-empty string)
 *   3. fileManager.getNewFileParent — Obsidian's default new-file location
 *
 * Path construction: normalizePath(<folder>/<target>.md).
 * Collision: if the path already exists, return the existing TFile without
 * calling vault.create (never silent overwrite).
 */

import { normalizePath } from "obsidian";
import type { OrbitalSettings } from "types/index";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CreateNoteResult {
	/** The TFile that was created or already existed. */
	file: NoteFile;
	/** True when the file already existed (collision — nothing was created). */
	existed: boolean;
}

// ---------------------------------------------------------------------------
// Minimal structural types — used instead of full Obsidian types so both the
// real App and the test mock App satisfy the interface without casting.
// ---------------------------------------------------------------------------

interface NoteFile {
	path: string;
}

interface FolderLike {
	path: string;
}

interface AppMinimal {
	vault: {
		getAbstractFileByPath(path: string): NoteFile | null;
		create(path: string, data: string): Promise<NoteFile>;
	};
	fileManager: {
		getNewFileParent(sourcePath: string): FolderLike;
	};
}

// ---------------------------------------------------------------------------
// createNote
// ---------------------------------------------------------------------------

/**
 * Create a new note at the resolved destination path.
 *
 * @param target       The base name of the note (no extension, no path).
 * @param app          Obsidian App (or compatible structural equivalent).
 * @param settings     Plugin settings — provides newNoteFolder default.
 * @param pickerFolder User-chosen folder from NotePickerModal, or null to skip.
 * @returns            CreateNoteResult with the NoteFile and whether it pre-existed.
 */
export async function createNote(
	target: string,
	app: AppMinimal,
	settings: OrbitalSettings,
	pickerFolder: FolderLike | null,
): Promise<CreateNoteResult> {
	const folderPath = resolveFolder(app, settings, pickerFolder);
	const filePath = buildPath(folderPath, target);

	const existing = app.vault.getAbstractFileByPath(filePath);
	if (existing !== null) {
		return { file: existing, existed: true };
	}

	const created = await app.vault.create(filePath, "");
	return { file: created, existed: false };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function resolveFolder(
	app: AppMinimal,
	settings: OrbitalSettings,
	pickerFolder: FolderLike | null,
): string {
	if (pickerFolder !== null) {
		return pickerFolder.path;
	}

	if (settings.newNoteFolder.length > 0) {
		return settings.newNoteFolder;
	}

	const parent = app.fileManager.getNewFileParent("");
	return parent.path;
}

function buildPath(folderPath: string, target: string): string {
	// Root folder: path is "/" — use the note name directly
	const isRoot = folderPath === "/" || folderPath === "";
	const raw = isRoot ? `${target}.md` : `${folderPath}/${target}.md`;
	return normalizePath(raw);
}
