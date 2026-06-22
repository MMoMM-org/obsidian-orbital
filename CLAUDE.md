# Orbital

Orbital plugin.

@~/Kouzou/standards/general.md

## Memory & Context
@docs/ai/memory/memory.md

## Routing Rules
- Repo conventions/style → docs/ai/memory/general.md
- Tool/CI/build knowledge → docs/ai/memory/tools.md
- Domain/business rules → docs/ai/memory/domain.md
- Architectural decisions → docs/ai/memory/decisions.md
- Current focus/blockers → docs/ai/memory/context.md
- Bugs/fixes → docs/ai/memory/troubleshooting.md

## Build Commands
```bash
npm run build        # TypeScript check + esbuild production build
npm test             # vitest unit tests
npm run lint         # eslint with obsidianmd rules
npm run dev          # esbuild watch mode (development)
npm run test:watch   # vitest watch mode
npm run test:coverage # vitest with v8 coverage
```

## Rules
- Use Plan Mode for any change touching more than 2 files
- Commit after every completed task
