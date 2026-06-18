import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [
			// Obsidian runtime replaced with hand-written mock for tests.
			{
				find: "obsidian",
				replacement: path.resolve(__dirname, "test/__mocks__/obsidian.ts"),
			},
			// Mirror tsconfig baseUrl: "src" for the top-level src/ directories.
			// Each entry maps the directory name to its absolute path so that
			// bare module paths (e.g. `types`, `types/index`, `settings/SettingsTab`)
			// resolve the same way TypeScript does in production.
			//
			// replacement interpolates $1 (the captured subpath) so the base absolute
			// path is built correctly.  The customResolver then disambiguates between
			// a bare directory import and a file-stem import by checking the filesystem:
			//   `types`        → src/types  (directory) → src/types/index.ts
			//   `types/index`  → src/types/index (stem)  → src/types/index.ts
			//   `types/Foo`    → src/types/Foo    (stem)  → src/types/Foo.ts
			// Add new src/ subdirectories here when they are created.
			{
				find: /^types(\/.*)?$/,
				replacement: path.resolve(__dirname, "src/types$1"),
				customResolver(updatedId: string) {
					if (fs.statSync(updatedId, { throwIfNoEntry: false })?.isDirectory()) {
						return `${updatedId}/index.ts`;
					}
					return fs.existsSync(`${updatedId}.ts`) ? `${updatedId}.ts` : updatedId;
				},
			},
			{
				find: /^settings(\/.*)?$/,
				replacement: path.resolve(__dirname, "src/settings$1"),
				customResolver(updatedId: string) {
					if (fs.statSync(updatedId, { throwIfNoEntry: false })?.isDirectory()) {
						return `${updatedId}/index.ts`;
					}
					return fs.existsSync(`${updatedId}.ts`) ? `${updatedId}.ts` : updatedId;
				},
			},
		],
	},
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
