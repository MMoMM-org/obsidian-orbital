import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vitest/config";

const SRC_ROOT = path.resolve(import.meta.dirname, "src");
const OBSIDIAN_MOCK = path.resolve(import.meta.dirname, "test/__mocks__/obsidian.ts");

/**
 * Resolve the bare module paths tests and src share, mirroring how production
 * resolves them:
 *
 *   - `obsidian`           → the hand-written mock, since the real runtime only
 *                            exists inside Obsidian.
 *   - everything else bare → tsconfig's `baseUrl: "src"`, e.g.
 *       `main`                     → src/main.ts
 *       `types/index`              → src/types/index.ts
 *       `view/panels/RecentPanel`  → src/view/panels/RecentPanel.ts
 *       `types`                    → src/types/index.ts  (directory import)
 *
 * This replaces ten near-identical `resolve.alias` entries that each carried a
 * `customResolver` — deprecated in vitest 5 and removed in Vite 9 (#39). Driving
 * it off the filesystem instead of a hardcoded directory list also means a new
 * `src/` subdirectory needs no change here.
 *
 * `enforce: "pre"` is required: the hook has to run before Vite's own resolver
 * turns a bare specifier into an unresolved-import error.
 */
function orbitalModulePaths(): Plugin {
	return {
		name: "orbital-module-paths",
		enforce: "pre",
		resolveId(source) {
			if (source === "obsidian") return OBSIDIAN_MOCK;

			// Only bare specifiers can be baseUrl paths. Relative and absolute ids
			// resolve normally, and `node:` builtins are never ours.
			if (source.startsWith(".") || source.startsWith("node:") || path.isAbsolute(source)) {
				return null;
			}

			const candidate = path.join(SRC_ROOT, source);
			// path.join normalises away any `..`, so re-check containment before
			// touching the filesystem.
			if (!candidate.startsWith(SRC_ROOT + path.sep)) return null;

			// Directory before file, matching the resolver this replaces. Returning
			// null for anything that does not exist under src/ is what keeps real
			// packages (vitest, …) on Vite's normal resolution path.
			if (fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) {
				const dirIndex = path.join(candidate, "index.ts");
				if (fs.existsSync(dirIndex)) return dirIndex;
			}
			const asFile = `${candidate}.ts`;
			return fs.existsSync(asFile) ? asFile : null;
		},
	};
}

export default defineConfig({
	plugins: [orbitalModulePaths()],
	test: {
		globals: true,
		environment: "jsdom",
		include: ["test/**/*.test.ts"],
		exclude: ["test/live/**"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.d.ts"],
		},
	},
});
