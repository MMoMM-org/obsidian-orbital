/**
 * HeaderSection — verifies the manifest-driven identity line and the hanko
 * `<img>` slot. The hanko comes from a build-time data URI in production;
 * this test only asserts the slot renders when an inlined URL is wired up,
 * so it stays green for new plugins that haven't dropped in their hanko yet.
 */

import {describe, it, expect} from "vitest";
import type {PluginManifest} from "obsidian";
import {augmentEl} from "../__mocks__/obsidian";
import {HeaderSection} from "../../src/settings/HeaderSection";

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
	return {
		id: "orbit",
		name: "Orbit",
		version: "0.0.0-test",
		minAppVersion: "1.5.7",
		description: "test",
		author: "Marcus Breiden",
		...overrides,
	} as PluginManifest;
}

describe("HeaderSection", () => {
	it("renders the manifest-driven identity line", () => {
		const section = new HeaderSection({plugin: {manifest: makeManifest({version: "1.2.3"})}});
		const container = augmentEl(document.createElement("div"));

		section.render(container);

		const text = container.textContent ?? "";
		expect(text).toContain("v1.2.3");
		expect(text).toContain("Marcus Breiden");
		expect(text).toContain("Documentation");
	});

	it("renders the curated tagline", () => {
		const section = new HeaderSection({plugin: {manifest: makeManifest()}});
		const container = augmentEl(document.createElement("div"));

		section.render(container);

		const tagline = container.querySelector("p.orbit-tagline");
		expect(tagline?.textContent).toBe("See what orbits your notes.");
	});

	it("does not render a hanko image until one is wired up", () => {
		// Default scaffold ships hankoImageUrl = null; once a plugin drops in
		// assets/<plugin-id>_hanko_144.png and uncomments the import, this
		// expectation flips. The mirror test ('renders the hanko image
		// without a runtime asset resolver') belongs in the consuming repo.
		const section = new HeaderSection({plugin: {manifest: makeManifest()}});
		const container = augmentEl(document.createElement("div"));

		section.render(container);

		expect(container.querySelector("img.mp-header-hanko")).toBeNull();
	});
});
