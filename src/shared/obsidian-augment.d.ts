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
import type { TFile } from "obsidian";

declare module "obsidian" {
	interface App {
		/**
		 * Internal drag manager — undocumented, may be absent on mobile or
		 * after an Obsidian API change. Feature-detect before use.
		 * @internal
		 */
		dragManager?: {
			/**
			 * Initiates a native file drag from a drag event.
			 * @internal
			 */
			dragFile(event: DragEvent, file: TFile): void;
			/**
			 * Hook called when a drag starts (may be needed for some Obsidian versions).
			 * @internal
			 */
			onDragStart(event: DragEvent, file: TFile): void;
		};
	}
}
