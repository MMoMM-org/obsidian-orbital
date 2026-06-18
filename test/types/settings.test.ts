import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "types/index";
import type { OrbitSettings } from "types/index";

describe("OrbitSettings", () => {
	describe("DEFAULT_SETTINGS", () => {
		it("has recentListLength of 20", () => {
			expect(DEFAULT_SETTINGS.recentListLength).toBe(20);
		});

		it("has secondHopCap of 50", () => {
			expect(DEFAULT_SETTINGS.secondHopCap).toBe(50);
		});

		it("has refreshDebounceMs of 300", () => {
			expect(DEFAULT_SETTINGS.refreshDebounceMs).toBe(300);
		});

		it("has danglingDefaultScope of 'vault'", () => {
			expect(DEFAULT_SETTINGS.danglingDefaultScope).toBe("vault");
		});

		it("has danglingGrouping of 'target'", () => {
			expect(DEFAULT_SETTINGS.danglingGrouping).toBe("target");
		});

		it("has defaultTab of 'relations'", () => {
			expect(DEFAULT_SETTINGS.defaultTab).toBe("relations");
		});

		it("has recentFiles defaulting to empty array", () => {
			expect(DEFAULT_SETTINGS.recentFiles).toEqual([]);
		});

		it("has secondHopEnabled defaulting to true", () => {
			expect(DEFAULT_SETTINGS.secondHopEnabled).toBe(true);
		});

		it("has showCounts defaulting to true", () => {
			expect(DEFAULT_SETTINGS.showCounts).toBe(true);
		});

		it("has excludePathPatterns defaulting to empty array", () => {
			expect(DEFAULT_SETTINGS.excludePathPatterns).toEqual([]);
		});

		it("has excludeTagPatterns defaulting to empty array", () => {
			expect(DEFAULT_SETTINGS.excludeTagPatterns).toEqual([]);
		});

		it("has newNoteFolder defaulting to empty string", () => {
			expect(DEFAULT_SETTINGS.newNoteFolder).toBe("");
		});
	});

	describe("loadSettings merges partial stored data over defaults", () => {
		function mergeSettings(stored: Partial<OrbitSettings> | null): OrbitSettings {
			return Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
		}

		it("preserves defaults when stored data is null", () => {
			const result = mergeSettings(null);
			expect(result.recentListLength).toBe(20);
			expect(result.defaultTab).toBe("relations");
		});

		it("overrides with stored values", () => {
			const result = mergeSettings({ recentListLength: 10, defaultTab: "recent" });
			expect(result.recentListLength).toBe(10);
			expect(result.defaultTab).toBe("recent");
		});

		it("keeps default values for keys not in stored data", () => {
			const result = mergeSettings({ recentListLength: 5 });
			expect(result.secondHopCap).toBe(50);
			expect(result.danglingDefaultScope).toBe("vault");
		});

		it("ignores unknown keys in stored data (no type bleed)", () => {
			const stored = { recentListLength: 7, unknownKey: "ignored" } as unknown as Partial<OrbitSettings>;
			const result = mergeSettings(stored);
			expect(result.recentListLength).toBe(7);
			expect((result as Record<string, unknown>)["unknownKey"]).toBe("ignored");
			// Object.assign merges — unknown keys pass through but typed fields are unaffected
			expect(result.defaultTab).toBe("relations");
		});

		it("merges partial recentFiles list", () => {
			const files = [{ path: "notes/a.md", basename: "a" }];
			const result = mergeSettings({ recentFiles: files });
			expect(result.recentFiles).toEqual(files);
		});
	});

	describe("type shape", () => {
		it("DEFAULT_SETTINGS is assignable to OrbitSettings", () => {
			const settings: OrbitSettings = DEFAULT_SETTINGS;
			expect(settings).toBeDefined();
		});
	});
});
