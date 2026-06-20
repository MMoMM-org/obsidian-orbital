/**
 * NotePickerModal / NoteFilePicker — T3.3 / T3.4
 *
 * Tests for the folder-picker fuzzy suggest modal used by createNote
 * and the note-picker fuzzy suggest modal used by handleAlias (ADR-6).
 *
 * Covers (NotePickerModal — folder picker):
 *   - getItems() returns all folders from the vault
 *   - getItemText() returns the folder path
 *   - Promise resolves when onChooseItem() is called
 *   - Promise resolves with null when the modal is closed without selection
 *
 * Covers (NoteFilePicker — note picker):
 *   - getItems() returns only .md files (no folders)
 *   - getItemText() returns the file path
 *   - pickNote() resolves with the chosen TFile
 *   - pickNote() resolves with null on dismiss
 */

import { describe, it, expect, vi } from "vitest";
import { App as MockApp, TFolder as MockTFolder, TFile as MockTFile } from "../__mocks__/obsidian";
import type { App, TFile, TFolder } from "obsidian";
import { NotePickerModal, NoteFilePicker } from "modals/NotePickerModal";

// Cast the mock App to the real App type — NotePickerModal only uses
// app.vault.getAllLoadedFiles() which the mock provides.
// See ConfirmRewriteModal.test.ts for reasoning on this cast pattern.
function makeApp(): App {
	const app = new MockApp();
	const root = new MockTFolder();
	root.path = "/";
	root.name = "/";

	const folderA = new MockTFolder();
	folderA.path = "projects";
	folderA.name = "projects";

	const folderB = new MockTFolder();
	folderB.path = "notes/journal";
	folderB.name = "journal";

	// Simulate getAllLoadedFiles returning folders
	vi.mocked(app.vault.getAllLoadedFiles).mockReturnValue(
		[root, folderA, folderB] as unknown as ReturnType<typeof app.vault.getAllLoadedFiles>,
	);

	return app as unknown as App;
}

function makeFolder(path: string): TFolder {
	const folder = new MockTFolder();
	folder.path = path;
	folder.name = path.split("/").at(-1) ?? path;
	return folder as unknown as TFolder;
}

function makeNote(path: string): TFile {
	const file = new MockTFile();
	file.path = path;
	file.name = path.split("/").at(-1) ?? path;
	file.basename = file.name.replace(/\.md$/, "");
	file.extension = "md";
	return file as unknown as TFile;
}

function makeNotePickerApp(): App {
	const app = new MockApp();
	const noteA = makeNote("notes/Alpha.md");
	const noteB = makeNote("projects/Beta.md");

	// getMarkdownFiles returns only TFile instances (no folders)
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(
		[noteA, noteB] as unknown as ReturnType<typeof app.vault.getMarkdownFiles>,
	);

	return app as unknown as App;
}

describe("NotePickerModal", () => {
	it("getItems() returns all TFolder instances from the vault", () => {
		const app = makeApp();
		const modal = new NotePickerModal(app);

		const items = modal.getItems();
		expect(items.length).toBe(3); // root + 2 folders
		expect(items.every((item) => item instanceof MockTFolder)).toBe(true);
	});

	it("getItemText() returns the folder path", () => {
		const app = makeApp();
		const modal = new NotePickerModal(app);

		const folder = makeFolder("some/path");
		expect(modal.getItemText(folder)).toBe("some/path");
	});

	it("getItemText() returns '/' for root folder", () => {
		const app = makeApp();
		const modal = new NotePickerModal(app);

		const root = makeFolder("/");
		expect(modal.getItemText(root)).toBe("/");
	});

	it("open() returns a Promise that resolves with the chosen folder", async () => {
		const app = makeApp();
		const modal = new NotePickerModal(app);

		const folder = makeFolder("chosen/folder");

		// Simulate user picking immediately after open
		const promise = modal.pickFolder();
		modal.onChooseItem(folder);

		const result = await promise;
		expect(result?.path).toBe("chosen/folder");
	});

	it("resolves with the chosen folder even when onClose fires before onChooseItem", async () => {
		// Obsidian closes the suggest modal BEFORE invoking onChooseItem on a
		// selection — the picker must still resolve with the chosen folder, not null.
		const app = makeApp();
		const modal = new NotePickerModal(app);

		const folder = makeFolder("chosen/folder");

		const promise = modal.pickFolder();
		modal.onClose(); // close fires first…
		modal.onChooseItem(folder); // …then the choice arrives

		const result = await promise;
		expect(result?.path).toBe("chosen/folder");
	});

	it("pickFolder() resolves with null when modal is closed without selection", async () => {
		const app = makeApp();
		const modal = new NotePickerModal(app);

		const promise = modal.pickFolder();
		modal.onClose();

		const result = await promise;
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// NoteFilePicker — note picker (T3.4 / ADR-6)
// ---------------------------------------------------------------------------

describe("NoteFilePicker", () => {
	it("getItems() returns only markdown files from the vault (no folders)", () => {
		const app = makeNotePickerApp();
		const picker = new NoteFilePicker(app);

		const items = picker.getItems();
		expect(items.length).toBe(2);
		expect(items.every((item) => item instanceof MockTFile)).toBe(true);
		// None of the items should be folders
		expect(items.every((item) => !("children" in item))).toBe(true);
	});

	it("getItems() returns only .md files", () => {
		const app = makeNotePickerApp();
		const picker = new NoteFilePicker(app);

		const items = picker.getItems();
		expect(items.every((item) => item.path.endsWith(".md"))).toBe(true);
	});

	it("getItemText() returns the file path", () => {
		const app = makeNotePickerApp();
		const picker = new NoteFilePicker(app);

		const note = makeNote("notes/MyNote.md");
		expect(picker.getItemText(note)).toBe("notes/MyNote.md");
	});

	it("pickNote() resolves with the chosen TFile when user selects", async () => {
		const app = makeNotePickerApp();
		const picker = new NoteFilePicker(app);

		const note = makeNote("notes/Chosen.md");

		const promise = picker.pickNote();
		picker.onChooseItem(note);

		const result = await promise;
		expect(result?.path).toBe("notes/Chosen.md");
	});

	it("resolves with the chosen note even when onClose fires before onChooseItem", async () => {
		// Real Obsidian closes the suggest modal BEFORE invoking onChooseItem on a
		// selection. The picker must still resolve with the chosen note, not null.
		const app = makeNotePickerApp();
		const picker = new NoteFilePicker(app);

		const note = makeNote("notes/Chosen.md");

		const promise = picker.pickNote();
		picker.onClose(); // close fires first…
		picker.onChooseItem(note); // …then the choice arrives

		const result = await promise;
		expect(result?.path).toBe("notes/Chosen.md");
	});

	it("pickNote() resolves with null when modal is dismissed without selection", async () => {
		const app = makeNotePickerApp();
		const picker = new NoteFilePicker(app);

		const promise = picker.pickNote();
		picker.onClose();

		const result = await promise;
		expect(result).toBeNull();
	});

	it("double-resolve guard: calling onChooseItem twice only resolves once", async () => {
		const app = makeNotePickerApp();
		const picker = new NoteFilePicker(app);

		const note1 = makeNote("notes/First.md");
		const note2 = makeNote("notes/Second.md");

		const promise = picker.pickNote();
		picker.onChooseItem(note1);
		picker.onChooseItem(note2); // second call — should be ignored

		const result = await promise;
		expect(result?.path).toBe("notes/First.md");
	});
});
