/**
 * Static asset module declarations.
 *
 * Why this file exists: esbuild's `dataurl` loader (and Vite's default asset
 * handling in tests) turns `import url from "./foo.png"` into a string at
 * build time. TypeScript needs an ambient module declaration to type the
 * import.
 *
 * Inlining keeps binary assets out of the release zip. The official Obsidian
 * Community Plugins installer and BRAT both download only `main.js`,
 * `manifest.json`, and `styles.css`, ignoring everything else — so anything
 * shipped in `assets/` would 404 on a non-developer install.
 */

declare module "*.png" {
	const src: string;
	export default src;
}
