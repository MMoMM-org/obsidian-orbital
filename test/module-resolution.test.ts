/**
 * Locks the module-path resolution that `orbitalModulePaths()` in
 * vitest.config.ts provides, so tests resolve bare specifiers exactly like
 * tsconfig's `baseUrl: "src"` does in production.
 *
 * Without this file the directory-import form (`types` → src/types/index.ts) has
 * no coverage at all: every real import in src/ and test/ spells out the file
 * (`types/index`). A silent regression there would only surface the first time
 * somebody writes the shorter form that `tsc` happily accepts.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS as viaDirectory } from "types";
import { DEFAULT_SETTINGS as viaFile } from "types/index";
import { RecentFilesStore } from "recent/RecentFilesStore";
import { TFile } from "obsidian";

describe("vitest module-path resolution", () => {
	it("resolves a bare directory import to its index.ts", () => {
		// Same module instance, not merely an equal shape.
		expect(viaDirectory).toBe(viaFile);
	});

	it("resolves a nested baseUrl path to its file", () => {
		expect(typeof RecentFilesStore).toBe("function");
	});

	it("resolves 'obsidian' to the test mock rather than the real runtime", () => {
		// The real runtime is unavailable outside Obsidian; the mock is a plain
		// class we can instantiate.
		const file = new TFile();
		expect(file).toBeInstanceOf(TFile);
	});
});
