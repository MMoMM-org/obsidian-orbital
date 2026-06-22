/**
 * createNote — T3.3
 *
 * Tests for the note-creation utility that resolves the destination folder
 * via NotePickerModal, settings.newNoteFolder, or fileManager.getNewFileParent,
 * then calls vault.create with a normalized path.
 *
 * Covers:
 *   - Uses NotePickerModal result when picker is used
 *   - Falls back to settings.newNoteFolder when picker is skipped
 *   - Falls back to fileManager.getNewFileParent when both are absent
 *   - Calls vault.create with normalizePath-ed path (<folder>/<target>.md)
 *   - Returns the created TFile
 *   - Collision: returns existing TFile without calling vault.create when note exists
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, TFile, TFolder, normalizePath } from "../__mocks__/obsidian";
import { createNote } from "links/createNote";
import type { OrbitSettings } from "types/index";
import { DEFAULT_SETTINGS } from "types/index";

function makeApp(): App {
	return new App();
}

function makeSettings(overrides?: Partial<OrbitSettings>): OrbitSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

function makeFolder(path: string): TFolder {
	const folder = new TFolder();
	folder.path = path;
	folder.name = path.split("/").at(-1) ?? path;
	return folder;
}

function makeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	const name = path.split("/").at(-1) ?? path;
	file.name = name;
	file.basename = name.replace(/\.md$/, "");
	return file;
}

describe("createNote", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
		// By default, no collision
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		// vault.create resolves with a new TFile
		vi.mocked(app.vault.create).mockResolvedValue(makeFile("NewNote.md"));
	});

	describe("folder resolution", () => {
		it("uses the picker-selected folder when provided", async () => {
			const pickerFolder = makeFolder("projects");
			const settings = makeSettings({ newNoteFolder: "" });

			const createdFile = makeFile("projects/NewNote.md");
			vi.mocked(app.vault.create).mockResolvedValue(createdFile);

			const result = await createNote("NewNote", app, settings, pickerFolder);

			expect(app.vault.create).toHaveBeenCalledWith(
				normalizePath("projects/NewNote.md"),
				"",
			);
			expect(result.file).toBe(createdFile);
		});

		it("uses settings.newNoteFolder when no picker folder provided", async () => {
			const settings = makeSettings({ newNoteFolder: "notes" });

			const createdFile = makeFile("notes/MyNote.md");
			vi.mocked(app.vault.create).mockResolvedValue(createdFile);

			const result = await createNote("MyNote", app, settings, null);

			expect(app.vault.create).toHaveBeenCalledWith(
				normalizePath("notes/MyNote.md"),
				"",
			);
			expect(result.file).toBe(createdFile);
		});

		it("uses fileManager.getNewFileParent when newNoteFolder is empty and no picker folder", async () => {
			const defaultFolder = makeFolder("default-location");
			vi.mocked(app.fileManager.getNewFileParent).mockReturnValue(defaultFolder);

			const settings = makeSettings({ newNoteFolder: "" });

			const createdFile = makeFile("default-location/SomeNote.md");
			vi.mocked(app.vault.create).mockResolvedValue(createdFile);

			await createNote("SomeNote", app, settings, null);

			expect(app.fileManager.getNewFileParent).toHaveBeenCalled();
			expect(app.vault.create).toHaveBeenCalledWith(
				normalizePath("default-location/SomeNote.md"),
				"",
			);
		});

		it("uses vault root when all resolution strategies return empty/root", async () => {
			const rootFolder = makeFolder("/");
			vi.mocked(app.fileManager.getNewFileParent).mockReturnValue(rootFolder);

			const settings = makeSettings({ newNoteFolder: "" });
			const createdFile = makeFile("RootNote.md");
			vi.mocked(app.vault.create).mockResolvedValue(createdFile);

			await createNote("RootNote", app, settings, null);

			// root path "/" should be stripped, resulting in "RootNote.md"
			const callArg = vi.mocked(app.vault.create).mock.calls[0]?.[0] as string;
			expect(callArg).toBe("RootNote.md");
		});
	});

	describe("path construction", () => {
		it("normalizes the path with normalizePath before calling vault.create", async () => {
			const pickerFolder = makeFolder("a//b");
			const settings = makeSettings();

			await createNote("Test", app, settings, pickerFolder);

			const callArg = vi.mocked(app.vault.create).mock.calls[0]?.[0] as string;
			// normalizePath collapses double slashes
			expect(callArg).not.toContain("//");
		});

		it("appends .md extension to the note name", async () => {
			const folder = makeFolder("notes");
			const settings = makeSettings();

			await createNote("MyNote", app, settings, folder);

			const callArg = vi.mocked(app.vault.create).mock.calls[0]?.[0] as string;
			expect(callArg).toMatch(/\.md$/);
		});
	});

	describe("collision handling", () => {
		it("returns existing TFile without calling vault.create when note already exists", async () => {
			const existingFile = makeFile("notes/AlreadyExists.md");
			vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(existingFile);

			const folder = makeFolder("notes");
			const settings = makeSettings();

			const result = await createNote("AlreadyExists", app, settings, folder);

			expect(app.vault.create).not.toHaveBeenCalled();
			expect(result.file).toBe(existingFile);
			expect(result.existed).toBe(true);
		});

		it("creates a new note when no collision exists", async () => {
			vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
			const newFile = makeFile("notes/FreshNote.md");
			vi.mocked(app.vault.create).mockResolvedValue(newFile);

			const folder = makeFolder("notes");
			const settings = makeSettings();

			const result = await createNote("FreshNote", app, settings, folder);

			expect(app.vault.create).toHaveBeenCalledOnce();
			expect(result.file).toBe(newFile);
			expect(result.existed).toBe(false);
		});
	});
});
