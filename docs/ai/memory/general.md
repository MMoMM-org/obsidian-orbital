# General Memory

## Settings documentation: JSDoc is the single source of truth

Every field in `OrbitalSettings` (`src/types/index.ts`) carries a `/** … */` JSDoc
comment. That comment is the canonical user-facing description: the doc-product
`extract` mode (`/doc-product extract`) reads it straight into the table in
`docs/configuration.md`. Fields without JSDoc come out as `[NEEDS DESCRIPTION]`.

**Why:** keeps settings docs DRY — one description per field, not duplicated in
`SettingsTab.ts` `setDesc()`, the interface, and the docs.

**How to apply:** when adding or changing a setting, write/update the JSDoc on the
interface field, then re-run `/doc-product extract` to regenerate
`docs/configuration.md` (it diffs before overwriting). Use the same wording as the
`setDesc()` text in `SettingsTab.ts`.
