# Configuration

This page documents every configuration setting available in Orbital. Each row
describes a single field: its name, expected type, default value, and what it controls.
Fields marked `[NEEDS DESCRIPTION]` or `[NEEDS REVIEW]` require author attention before
the documentation is complete. Fields marked `[NEEDS DEFAULT]` have no recorded default
and should be confirmed against the source code.

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `recentListLength` | `number` | `20` | Number of recently visited notes to show. |
| `excludePathPatterns` | `string[]` | `[]` | File path patterns to exclude (one per line, plain text or regex). |
| `excludeTagPatterns` | `string[]` | `[]` | Tag patterns to exclude (one per line, plain text or regex). |
| `secondHopCap` | `number` | `50` | Maximum number of second-hop links to display. |
| `secondHopEnabled` | `boolean` | `true` | Show links that are two hops away from the active note. |
| `refreshDebounceMs` | `number` | `300` | Delay in milliseconds before relations refresh after a file change. |
| `danglingDefaultScope` | `DanglingScope` | `"vault"` | Whether to show dangling links for the whole vault or just the current folder. |
| `danglingGrouping` | `DanglingGrouping` | `"target"` | Group dangling links by their target (missing note) or by their source file. |
| `newNoteFolder` | `string` | `""` | Folder for new notes created from dangling links. Leave empty to use the default location. |
| `defaultTab` | `TabId` | `"relations"` | Which tab to show when the orbit pane opens. |
| `showCounts` | `boolean` | `true` | Display item counts on each tab label. |
| `showStatusBar` | `boolean` | `true` | When true, a status-bar item shows backlink/2nd-hop counts for the active note. |
| `unlinkedMentionsEnabled` | `boolean` | `true` | When true, the Relations tab shows an "Unlinked mentions" section. |
| `unlinkedOpenInNewTab` | `boolean` | `false` | When true, clicking an unlinked mention opens the note in a new tab. |
| `debugLogging` | `boolean` | `false` | When true, Orbital emits verbose [Orbital] console.debug traces for diagnostics. |
| `recentFiles` | `{ path: string; basename: string }[]` | `[]` | Internal persisted state: the most-recently-visited notes list. Not user-configurable. |
