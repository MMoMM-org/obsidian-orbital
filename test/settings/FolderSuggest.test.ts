/**
 * FolderSuggest — folder-path autocomplete for the "New note folder" setting.
 *
 * Tests cover:
 * - getSuggestions returns only TFolders whose path matches the query
 *   (case-insensitive substring), excluding TFiles
 * - selectSuggestion writes the folder path into the input, fires an `input`
 *   event so the host Setting persists, and closes the popover
 * - renderSuggestion shows the folder path (and "/" for the vault root)
 */

import { describe, it, expect, vi } from "vitest";
import { App, TFile, TFolder, augmentEl } from "../__mocks__/obsidian";
import { FolderSuggest } from "settings/FolderSuggest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFolder(path: string): TFolder {
	const folder = new TFolder();
	folder.path = path;
	folder.name = path.split("/").pop() ?? path;
	return folder;
}

/** Access the protected getSuggestions for assertions. */
function suggestions(suggest: FolderSuggest, query: string): TFolder[] {
	return (
		suggest as unknown as { getSuggestions(q: string): TFolder[] }
	).getSuggestions(query);
}

function makeSuggest(loadedFiles: (TFile | TFolder)[]): {
	suggest: FolderSuggest;
	input: HTMLInputElement;
} {
	const app = new App();
	vi.mocked(app.vault.getAllLoadedFiles).mockReturnValue(loadedFiles);
	const input = document.createElement("input");
	const suggest = new FolderSuggest(app, input);
	return { suggest, input };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FolderSuggest — getSuggestions", () => {
	it("returns folders whose path contains the query, case-insensitively", () => {
		const { suggest } = makeSuggest([
			makeFolder("Notes"),
			makeFolder("Notes/Daily"),
			makeFolder("Archive"),
		]);

		const result = suggestions(suggest, "note").map((f) => f.path);
		expect(result).toEqual(["Notes", "Notes/Daily"]);
	});

	it("excludes TFiles, returning only folders", () => {
		const file = new TFile();
		file.path = "Notes/today.md";
		const { suggest } = makeSuggest([makeFolder("Notes"), file]);

		const result = suggestions(suggest, "notes");
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe("Notes");
	});

	it("returns all folders for an empty query", () => {
		const { suggest } = makeSuggest([
			makeFolder("Notes"),
			makeFolder("Archive"),
		]);

		expect(suggestions(suggest, "")).toHaveLength(2);
	});
});

describe("FolderSuggest — selectSuggestion", () => {
	it("writes the folder path to the input and fires an input event", () => {
		const { suggest, input } = makeSuggest([]);
		const onInput = vi.fn();
		input.addEventListener("input", onInput);

		suggest.selectSuggestion(makeFolder("Notes/Daily"));

		expect(input.value).toBe("Notes/Daily");
		expect(onInput).toHaveBeenCalledTimes(1);
	});

	it("closes the popover after selection", () => {
		const { suggest } = makeSuggest([]);
		suggest.selectSuggestion(makeFolder("Notes"));
		expect(suggest.close).toHaveBeenCalled();
	});
});

describe("FolderSuggest — renderSuggestion", () => {
	it("renders the folder path", () => {
		const { suggest } = makeSuggest([]);
		const el = augmentEl(document.createElement("div"));
		suggest.renderSuggestion(makeFolder("Notes/Daily"), el);
		expect(el.textContent).toBe("Notes/Daily");
	});

	it("renders the vault root (empty path) as '/'", () => {
		const { suggest } = makeSuggest([]);
		const el = augmentEl(document.createElement("div"));
		suggest.renderSuggestion(makeFolder(""), el);
		expect(el.textContent).toBe("/");
	});
});
