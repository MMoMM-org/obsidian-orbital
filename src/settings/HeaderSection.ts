/**
 * HeaderSection — persistent identity header for the plugin's settings tab.
 *
 * Why this file exists: every MiYo Obsidian plugin shares the same identity
 * shape so settings tabs feel uniform across Kado, Hashi, Hakobi, and any
 * future plugin. Two-column flex: name + version + author + Documentation
 * link on the left, plugin hanko (印, the seal) on the right, tagline beneath
 * the identity line. Content is sourced from `manifest.json` so version and
 * author auto-update on release; tagline is curated identity copy and stays
 * independent from the search-friendly `manifest.description` Obsidian shows
 * in the Community Plugins listing.
 *
 * Hanko delivery: imported as a build-time data URI via esbuild's `dataurl`
 * loader. The PNG is inlined into `main.js` so the seal renders regardless
 * of installer — the official Obsidian Community Plugins flow and BRAT both
 * fetch only `main.js`, `manifest.json`, and `styles.css` from a release and
 * silently skip a sibling `assets/` folder. Pre-scale the source PNG to
 * 144×144 (2× HiDPI of the rendered 72×72) — the README-grade 1024×1024
 * original blows up `main.js` by ~1.4 MB; 144×144 adds ~36 KB.
 *
 * Funding links: not rendered here. Obsidian's Community Plugins UI surfaces
 * `manifest.fundingUrl` automatically on the listing page; duplicating it
 * inside settings is noise.
 *
 * To use this file in a new plugin:
 *   1. Drop your hanko at assets/orbit_hanko_144.png (144×144 PNG).
 *   2. Uncomment the hanko import below and remove the `null` fallback.
 *   3. Set REPO_URL to your GitHub repo and TAGLINE to one curated line.
 *   4. Replace the `mp` CSS-class prefix throughout this file and styles.css
 *      with your plugin's short prefix (e.g. `kado`, `hashi`).
 */

import type {PluginManifest} from "obsidian";
// import hankoImageUrl from "../../assets/orbit_hanko_144.png";
const hankoImageUrl: string | null = null;

interface HeaderSectionDeps {
	plugin: {manifest: PluginManifest};
}

const REPO_URL = "https://github.com/MMoMM-org/obsidian-orbit";
const TAGLINE = "Curated one-line tagline — replace per plugin";

function parseAuthorDisplayName(author: string): string {
	const angleIdx = author.indexOf("<");
	if (angleIdx === -1) return author.trim();
	return author.slice(0, angleIdx).trim();
}

export class HeaderSection {
	private readonly plugin: {manifest: PluginManifest};

	constructor(deps: HeaderSectionDeps) {
		this.plugin = deps.plugin;
	}

	render(containerEl: HTMLElement): void {
		const {manifest} = this.plugin;
		const manifestWithUrl = manifest as PluginManifest & {authorUrl?: string};

		const textCol = containerEl.createDiv({cls: "orbit-header-text"});
		const identity = textCol.createDiv({cls: "orbit-header-identity"});

		identity.createSpan({text: manifest.name, cls: "orbit-plugin-name"});
		identity.createSpan({text: ` v${manifest.version}`});

		const authorName = parseAuthorDisplayName(manifest.author ?? "");
		identity.createSpan({text: " · ", cls: "orbit-header-sep"});
		if (manifestWithUrl.authorUrl !== undefined) {
			identity.createEl("a", {text: authorName, href: manifestWithUrl.authorUrl});
		} else {
			identity.createSpan({text: authorName});
		}

		identity.createSpan({text: " · ", cls: "orbit-header-sep"});
		identity.createEl("a", {text: "Documentation", href: REPO_URL});

		textCol.createEl("p", {text: TAGLINE, cls: "orbit-tagline"});

		if (hankoImageUrl !== null) {
			containerEl.createEl("img", {
				cls: "orbit-header-hanko",
				attr: {
					src: hankoImageUrl,
					alt: `${manifest.name} hanko`,
				},
			});
		}
	}
}
