/**
 * RenameTargetPicker — combined notes + dangling-targets picker for rename/merge.
 *
 * Covers: item list (notes + dangling, current excluded, deduped), value resolution,
 * the onClose-before-onChooseItem ordering, and dismissal.
 */

import { describe, it, expect, vi } from "vitest";
import { App } from "../__mocks__/obsidian";
import { RenameTargetPicker } from "modals/RenameTargetPicker";

type PickerApp = ConstructorParameters<typeof RenameTargetPicker>[0];

function makeApp(noteBasenames: string[]): App {
	const app = new App();
	(app.vault.getMarkdownFiles as ReturnType<typeof vi.fn>).mockReturnValue(
		noteBasenames.map((basename) => ({ basename })),
	);
	return app;
}

function makeIndex(targets: string[]): { danglingTargets: () => { target: string }[] } {
	return { danglingTargets: () => targets.map((target) => ({ target })) };
}

function makePicker(notes: string[], dangling: string[], currentTarget: string): RenameTargetPicker {
	return new RenameTargetPicker(
		makeApp(notes) as unknown as PickerApp,
		makeIndex(dangling),
		currentTarget,
	);
}

describe("RenameTargetPicker", () => {
	it("lists notes and dangling targets, excluding the current target", () => {
		const picker = makePicker(
			["Zettelkasten", "Evergreen Notes"],
			["Atlas of Concepts", "Fleeting Notes"],
			"Fleeting Notes",
		);

		const values = picker.getItems().map((i) => i.value);
		expect(values).toContain("Zettelkasten");
		expect(values).toContain("Evergreen Notes");
		expect(values).toContain("Atlas of Concepts");
		expect(values).not.toContain("Fleeting Notes"); // current target excluded
	});

	it("dedupes a name that is both a note and a dangling target (note wins)", () => {
		const picker = makePicker(["Zettelkasten"], ["Zettelkasten"], "X");

		const zettel = picker.getItems().filter((i) => i.value === "Zettelkasten");
		expect(zettel).toHaveLength(1);
		expect(zettel[0]?.kind).toBe("note");
	});

	it("tags each item by kind for display", () => {
		const picker = makePicker(["Zettelkasten"], ["Atlas of Concepts"], "X");
		const note = picker.getItems().find((i) => i.value === "Zettelkasten");
		const dangling = picker.getItems().find((i) => i.value === "Atlas of Concepts");
		expect(picker.getItemText(note!)).toContain("note");
		expect(picker.getItemText(dangling!)).toContain("dangling");
	});

	it("resolves with the chosen value", async () => {
		const picker = makePicker(["Zettelkasten"], [], "X");
		const p = picker.pick();
		picker.onChooseItem({ value: "Zettelkasten", kind: "note" });
		expect(await p).toBe("Zettelkasten");
	});

	it("resolves with the chosen value even when onClose fires before onChooseItem", async () => {
		const picker = makePicker(["Zettelkasten"], [], "X");
		const p = picker.pick();
		picker.onClose(); // close fires first…
		picker.onChooseItem({ value: "Zettelkasten", kind: "note" }); // …then the choice
		expect(await p).toBe("Zettelkasten");
	});

	it("resolves null when dismissed without a selection", async () => {
		const picker = makePicker([], [], "X");
		const p = picker.pick();
		picker.onClose();
		expect(await p).toBeNull();
	});
});
