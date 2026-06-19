/**
 * NotePickerModal — T3.3
 *
 * Tests for the folder-picker fuzzy suggest modal used by createNote.
 *
 * Covers:
 *   - getItems() returns all folders from the vault
 *   - getItemText() returns the folder path
 *   - Promise resolves when onChooseItem() is called
 *   - Promise resolves with null when the modal is closed without selection
 */

import { describe, it, expect, vi } from "vitest";
import { App as MockApp, TFolder as MockTFolder } from "../__mocks__/obsidian";
import type { App, TFolder } from "obsidian";
import { NotePickerModal } from "modals/NotePickerModal";

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

	it("pickFolder() resolves with null when modal is closed without selection", async () => {
		const app = makeApp();
		const modal = new NotePickerModal(app);

		const promise = modal.pickFolder();
		modal.onClose();

		const result = await promise;
		expect(result).toBeNull();
	});
});
