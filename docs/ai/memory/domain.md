# Domain Memory

## Unlinked mentions (Relations tab) — added 2026-06-20

"Unlinked mention" = a plain-text occurrence of the **active note's** name
(basename **or** a frontmatter alias) inside **another** note that is not
already part of a link. Direction is *incoming* (who mentions me?) — the
natural partner of Backlinks, not of Missing (which is outgoing broken links).

Matching rules (`src/graph/unlinkedMentions.ts`, pure):
- Case-insensitive; the document's original casing is preserved in `matchedText`.
- Word-bounded via Unicode `\p{L}\p{N}_` neighbour checks (so "Java" ≠
  "JavaScript"), NOT ASCII `\b`.
- Overlapping matches from multiple names dedupe to the longest (most specific).
- Skipped regions (`collectMaskSpans`): existing wikilink/embed cache positions,
  the leading frontmatter block, fenced + inline code, markdown-link syntax, and
  a wikilink regex fallback when cache positions are absent.

Linking rule (`MentionLinkService.linkMentions`): replacement built via
`fileManager.generateMarkdownLink` (honours the user's link-format settings).
Alias is passed **only when** the matched text differs from the active note's
basename (preserves the visible text for aliases / case variants); otherwise a
bare link. Occurrences are re-found at apply time and spliced in descending
offset order — never trust cached offsets.
