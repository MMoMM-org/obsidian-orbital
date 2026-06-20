/**
 * ConfirmRewriteModal — T3.3
 *
 * Tests for the confirmation gate that precedes every vault-wide destructive op.
 * CON-7: preview (occurrences + files) + non-reversible warning + explicit confirm.
 *
 * Covers:
 *   - Shows occurrence count and file count in preview
 *   - Shows non-reversible warning text
 *   - Confirm button is disabled when name is empty (rename op)
 *   - Confirm button is enabled when a valid name is provided
 *   - Merge notice shown when name matches an existing note
 *   - onConfirm callback receives the entered name
 *   - Delete op requires explicit confirm (affirmative action)
 *   - Non-rename ops (merge, alias) do not need a name input
 */

import { describe, it, expect, vi } from "vitest";
import { App as MockApp } from "../__mocks__/obsidian";
import type { App } from "obsidian";
import { ConfirmRewriteModal } from "modals/ConfirmRewriteModal";
import type { RewritePreview } from "links/LinkRewriteService";

// Cast the mock App to the real App type — the mock implements all methods that
// Modal's constructor actually uses. The structural gap (keymap, scope, etc.) is
// not exercised by ConfirmRewriteModal. This cast pattern follows the codebase
// convention for modal/view tests where the real App type is required by
// Obsidian's class hierarchy but only a subset is exercised in tests.
function makeApp(): App {
	return new MockApp() as unknown as App;
}

function makePreview(occurrences = 5, filePaths = ["a.md", "b.md"]): RewritePreview {
	return {
		occurrences,
		files: filePaths.map((path) => ({ path, count: 1 })),
	};
}

describe("ConfirmRewriteModal", () => {
	describe("preview display", () => {
		it("shows occurrence count in the preview text", () => {
			const app = makeApp();
			const onConfirm = vi.fn();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(7, ["x.md", "y.md", "z.md"]),
				kind: "rename",
				onConfirm,
			});
			modal.onOpen();

			const text = modal.contentEl.textContent ?? "";
			expect(text).toContain("7");
		});

		it("shows file count in the preview text", () => {
			const app = makeApp();
			const onConfirm = vi.fn();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(3, ["a.md", "b.md"]),
				kind: "rename",
				onConfirm,
			});
			modal.onOpen();

			const text = modal.contentEl.textContent ?? "";
			expect(text).toContain("2"); // 2 files
		});

		it("renders a non-reversible warning", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "rename",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const text = modal.contentEl.textContent ?? "";
			// Must contain a warning about irreversibility
			expect(text.toLowerCase()).toMatch(/cannot be undone|irreversible|back up/);
		});
	});

	describe("rename op — name input validation", () => {
		it("confirm button is disabled initially when name is empty", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "rename",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			expect(btn).not.toBeNull();
			expect(btn?.disabled).toBe(true);
		});

		it("confirm button is enabled after a valid name is entered", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "rename",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const input = modal.contentEl.querySelector<HTMLInputElement>("input[type='text']");
			expect(input).not.toBeNull();
			input!.value = "NewName";
			input!.dispatchEvent(new Event("input"));

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			expect(btn?.disabled).toBe(false);
		});

		it("confirms with the entered name when confirmed", () => {
			const app = makeApp();
			const onConfirm = vi.fn();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "rename",
				onConfirm,
			});
			modal.onOpen();

			const input = modal.contentEl.querySelector<HTMLInputElement>("input[type='text']");
			input!.value = "MyNewNote";
			input!.dispatchEvent(new Event("input"));

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			btn!.click();

			expect(onConfirm).toHaveBeenCalledWith("MyNewNote");
		});

		it("shows merge notice when name matches an existing note", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "rename",
				onConfirm: vi.fn(),
				existingNoteNames: ["ExistingNote"],
			});
			modal.onOpen();

			const input = modal.contentEl.querySelector<HTMLInputElement>("input[type='text']");
			input!.value = "ExistingNote";
			input!.dispatchEvent(new Event("input"));

			const mergeEl = modal.contentEl.querySelector("[data-notice='merge']");
			expect(mergeEl).not.toBeNull();
			expect(mergeEl?.textContent).toContain("ExistingNote");
		});

		it("hides merge notice when name does not match an existing note", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "rename",
				onConfirm: vi.fn(),
				existingNoteNames: ["ExistingNote"],
			});
			modal.onOpen();

			const input = modal.contentEl.querySelector<HTMLInputElement>("input[type='text']");
			input!.value = "BrandNewName";
			input!.dispatchEvent(new Event("input"));

			const mergeEl = modal.contentEl.querySelector("[data-notice='merge']");
			// Either absent or has is-hidden class
			const isVisible = mergeEl !== null && !mergeEl.classList.contains("is-hidden");
			expect(isVisible).toBe(false);
		});
	});

	describe("rename op — choose existing picker", () => {
		it("renders a 'Choose existing…' button when pickExisting is provided", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "rename",
				onConfirm: vi.fn(),
				pickExisting: vi.fn(async () => null),
			});
			modal.onOpen();

			expect(modal.contentEl.querySelector("[data-action='pick-existing']")).not.toBeNull();
		});

		it("does not render the picker button when pickExisting is absent", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "rename",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			expect(modal.contentEl.querySelector("[data-action='pick-existing']")).toBeNull();
		});

		it("fills the input, enables Confirm, and shows the merge notice when a matching value is picked", async () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "rename",
				onConfirm: vi.fn(),
				existingNoteNames: ["Evergreen Notes"],
				pickExisting: vi.fn(async () => "Evergreen Notes"),
			});
			modal.onOpen();

			const pickBtn = modal.contentEl.querySelector("[data-action='pick-existing']") as HTMLElement;
			pickBtn.click();
			await new Promise((r) => setTimeout(r, 0));

			const input = modal.contentEl.querySelector(".orbit-confirm-input") as HTMLInputElement;
			expect(input.value).toBe("Evergreen Notes");

			const confirmBtn = modal.contentEl.querySelector("[data-action='confirm']") as HTMLButtonElement;
			expect(confirmBtn.disabled).toBe(false);

			const mergeEl = modal.contentEl.querySelector("[data-notice='merge']");
			expect(mergeEl).not.toBeNull();
			expect(mergeEl!.classList.contains("is-hidden")).toBe(false);
		});
	});

	describe("delete op", () => {
		it("confirm button is disabled until the user checks an explicit confirm checkbox", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "delete",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			expect(btn?.disabled).toBe(true);
		});

		it("confirm button becomes enabled after the delete checkbox is checked", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "delete",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const checkbox = modal.contentEl.querySelector<HTMLInputElement>("input[type='checkbox']");
			expect(checkbox).not.toBeNull();
			checkbox!.checked = true;
			checkbox!.dispatchEvent(new Event("change"));

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			expect(btn?.disabled).toBe(false);
		});

		it("calls onConfirm with empty string for delete op", () => {
			const app = makeApp();
			const onConfirm = vi.fn();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "delete",
				onConfirm,
			});
			modal.onOpen();

			const checkbox = modal.contentEl.querySelector<HTMLInputElement>("input[type='checkbox']");
			checkbox!.checked = true;
			checkbox!.dispatchEvent(new Event("change"));

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			btn!.click();

			expect(onConfirm).toHaveBeenCalledWith("");
		});

		it("does not show a text input for delete op", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "delete",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const input = modal.contentEl.querySelector<HTMLInputElement>("input[type='text']");
			expect(input).toBeNull();
		});

		it("renders the 'Only in note' checkbox only when deleteSourceNote is provided", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "delete",
				deleteSourceNote: "Slip Box",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const checkbox = modal.contentEl.querySelector<HTMLInputElement>(
				"input[id='orbit-confirm-delete-only-note']",
			);
			expect(checkbox).not.toBeNull();
			expect(checkbox?.type).toBe("checkbox");
		});

		it("omits the 'Only in note' checkbox when no deleteSourceNote (by-target grouping)", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "delete",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const checkbox = modal.contentEl.querySelector<HTMLInputElement>(
				"input[id='orbit-confirm-delete-only-note']",
			);
			expect(checkbox).toBeNull();
			expect(modal.onlyInThisNote).toBe(false);
		});

		it("'Only in note' checkbox is pre-checked (onlyInThisNote = true) when a source note is given", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "delete",
				deleteSourceNote: "Slip Box",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			expect(modal.onlyInThisNote).toBe(true);

			const checkbox = modal.contentEl.querySelector<HTMLInputElement>(
				"input[id='orbit-confirm-delete-only-note']",
			);
			expect(checkbox?.checked).toBe(true);
		});

		it("unchecking 'Only in note' sets onlyInThisNote back to false", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "delete",
				deleteSourceNote: "Slip Box",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const checkbox = modal.contentEl.querySelector<HTMLInputElement>(
				"input[id='orbit-confirm-delete-only-note']",
			);
			checkbox!.checked = false;
			checkbox!.dispatchEvent(new Event("change"));

			expect(modal.onlyInThisNote).toBe(false);
		});

		it("'Only in note' label names the source note in sentence case", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "delete",
				deleteSourceNote: "Slip Box",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const label = modal.contentEl.querySelector<HTMLLabelElement>(
				"label[for='orbit-confirm-delete-only-note']",
			);
			expect(label).not.toBeNull();
			expect(label?.textContent).toBe("Only in note: Slip Box");
		});
	});

	describe("non-rename ops (merge, alias)", () => {
		it("merge op confirm button is enabled without name input", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "merge",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			expect(btn?.disabled).toBe(false);
		});

		it("alias op confirm button is enabled without name input", () => {
			const app = makeApp();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "alias",
				onConfirm: vi.fn(),
			});
			modal.onOpen();

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			expect(btn?.disabled).toBe(false);
		});

		it("calls onConfirm with empty string when confirm is clicked for merge op", () => {
			const app = makeApp();
			const onConfirm = vi.fn();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "merge",
				onConfirm,
			});
			modal.onOpen();

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			btn!.click();

			expect(onConfirm).toHaveBeenCalledWith("");
		});

		it("calls onConfirm with empty string when confirm is clicked for alias op", () => {
			const app = makeApp();
			const onConfirm = vi.fn();
			const modal = new ConfirmRewriteModal(app, {
				preview: makePreview(),
				kind: "alias",
				onConfirm,
			});
			modal.onOpen();

			const btn = modal.contentEl.querySelector<HTMLButtonElement>("[data-action='confirm']");
			btn!.click();

			expect(onConfirm).toHaveBeenCalledWith("");
		});
	});
});
