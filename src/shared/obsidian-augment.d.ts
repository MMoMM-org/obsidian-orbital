/**
 * obsidian-augment.d.ts — module augmentation for undocumented Obsidian internals.
 *
 * All internal APIs typed here are:
 *   - optional (may be absent on mobile or after an API change)
 *   - marked @internal (never call these from outside DragInsertHelper)
 *   - never cast via `any` or suppressed via ts-ignore
 *
 * Only DragInsertHelper may consume dragManager. No other module should
 * reference this augmentation.
 */

import "obsidian";

declare module "obsidian" {
	interface App {
		/**
		 * Internal drag manager — undocumented, may be absent on mobile or
		 * after an Obsidian API change. Feature-detect before use.
		 * @internal
		 */
		dragManager?: {
			/**
			 * Initiates a native file drag and returns a drag-data object.
			 * The returned value must be passed to onDragStart to register the session.
			 * @internal
			 */
			dragFile(event: DragEvent, file: import("obsidian").TFile): unknown;
			/**
			 * Registers the drag session with Obsidian's drag subsystem.
			 * Must be called with the drag-data returned by dragFile.
			 * @internal
			 */
			onDragStart(event: DragEvent, dragData: unknown): void;
		};
	}
}
