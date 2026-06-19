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
	});
});
