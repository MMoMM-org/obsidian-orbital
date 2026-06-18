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
			// bare module paths (e.g. `types/index`, `settings/SettingsTab`)
			// resolve the same way TypeScript does in production.
			// Add new src/ subdirectories here when they are created.
			{
				find: /^types(\/.*)?$/,
				replacement: path.resolve(__dirname, "src/types$1"),
			},
			{
				find: /^settings(\/.*)?$/,
				replacement: path.resolve(__dirname, "src/settings$1"),
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
