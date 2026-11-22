## [1.3.1](https://github.com/MMoMM-org/obsidian-orbital/compare/1.3.0...1.3.1) (2026-11-22)

### Bug Fixes

* **release:** pin conventionalcommits preset to 9.x for writer 8 ([ee7a4a7](https://github.com/MMoMM-org/obsidian-orbital/commit/ee7a4a706d535f844ccee7fcc4e557ba11301ddf)), closes [#25](https://github.com/MMoMM-org/obsidian-orbital/issues/25) [#36](https://github.com/MMoMM-org/obsidian-orbital/issues/36)
* **test:** declare @vitest/coverage-v8 so test:coverage runs ([22da940](https://github.com/MMoMM-org/obsidian-orbital/commit/22da9408148e7475cee55d10c58d5dadf88d11a6)), closes [#39](https://github.com/MMoMM-org/obsidian-orbital/issues/39)
* **view:** restore search-box focus in popout windows ([631d320](https://github.com/MMoMM-org/obsidian-orbital/commit/631d3202591e173270986c7390febeb55a9f304a))

## [1.3.0](https://github.com/MMoMM-org/obsidian-orbital/compare/1.2.0...1.3.0) (2026-07-06)

### Features

* **context-tab:** add the Context tab settings group ([6fb838c](https://github.com/MMoMM-org/obsidian-orbital/commit/6fb838c3738873f6567b544115f80f2d9d08e033))
* **context-tab:** ContextPanel with toolbar, sort, search, context amount ([f8e91d0](https://github.com/MMoMM-org/obsidian-orbital/commit/f8e91d08145fda205563e0f77c97fe7c6d415581))
* **context-tab:** tab plumbing, settings, and context-amount extraction ([554c719](https://github.com/MMoMM-org/obsidian-orbital/commit/554c71988b30283912f3927a69294a2520efe7d2))

### Bug Fixes

* **context-tab:** name-sort icon, live settings refresh, status-bar target ([98b2bdf](https://github.com/MMoMM-org/obsidian-orbital/commit/98b2bdf2c6686d700c006c1d6af6cf1b7f06a64f))

## [1.2.0](https://github.com/MMoMM-org/obsidian-orbital/compare/1.1.0...1.2.0) (2026-07-06)

### Features

* **footer:** add auto-footer render child + reconciliation controller ([a433561](https://github.com/MMoMM-org/obsidian-orbital/commit/a4335614627a80039dd17ac78c76d09a28f3e973))
* **footer:** wire auto-footer into plugin, settings toggle, and styles ([76b029f](https://github.com/MMoMM-org/obsidian-orbital/commit/76b029f5ea3982725380f43468927e9fca3a888e))

### Bug Fixes

* **footer:** make the reading-view footer robust to unattached sections ([d116b41](https://github.com/MMoMM-org/obsidian-orbital/commit/d116b41d5d6919a904c6589fd288d7cd2fe9b116))
* **footer:** provide the block widget via a StateField, not a ViewPlugin ([b2bed04](https://github.com/MMoMM-org/obsidian-orbital/commit/b2bed04ed1eb77a53e53598b4acc2937ca35fe2a))
* **footer:** render via post-processor + CM widget, not sizer injection ([b23518c](https://github.com/MMoMM-org/obsidian-orbital/commit/b23518c89e08c39fee25c95de49b5632f7fb565f))

## [1.1.0](https://github.com/MMoMM-org/obsidian-orbital/compare/1.0.1...1.1.0) (2026-07-06)

### Features

* **backlink-codeblock:** render orbital-backlinks block + wire processor ([158c28b](https://github.com/MMoMM-org/obsidian-orbital/commit/158c28b69b36b7244fa57011a83a5842be5baedc))
* **codeblock:** context styles, collapse & click-to-open (v1.1) ([c1e627b](https://github.com/MMoMM-org/obsidian-orbital/commit/c1e627bb44005cb38db98474cdf61befaeaf7dd5))
* **codeblock:** per-source occurrence count in context mode ([d81226c](https://github.com/MMoMM-org/obsidian-orbital/commit/d81226ce179e059f09f3488ef92f5630f4cbef5e))
* **codeblock:** pure core for orbital-backlinks (Phase 1) ([580bddf](https://github.com/MMoMM-org/obsidian-orbital/commit/580bddf4eb6217f447bf935ac7ef351094a85c8d))

## [1.0.1](https://github.com/MMoMM-org/obsidian-orbital/compare/1.0.0...1.0.1) (2026-07-01)

### Bug Fixes

* **release:** conventionalcommits preset so semantic-release keeps ! commits ([2530d73](https://github.com/MMoMM-org/obsidian-orbital/commit/2530d733ee3b6437d2b960859567e65d11c49e98))

# [1.0.0](https://github.com/MMoMM-org/obsidian-orbital/compare/0.11.0...1.0.0) (2026-06-23)


### Bug Fixes

* **dangling:** clickable source headers + refresh list after bulk rewrites ([db7d0f7](https://github.com/MMoMM-org/obsidian-orbital/commit/db7d0f712b19fe7da41fdf94e41d0eaa2fd513c0))
* **dangling:** stop search box from stealing focus on passive repaints ([7bb4b57](https://github.com/MMoMM-org/obsidian-orbital/commit/7bb4b5776fbe66d4c0af684effb68eb9099e77fa))


### Features

* graduate to a stable 1.0.0 release ([1803c6d](https://github.com/MMoMM-org/obsidian-orbital/commit/1803c6df8f58907a369a596db1da7bea9ecbb1fa))


### BREAKING CHANGES

* first stable release (1.0.0). No code changes — this marks
the graduation from 0.x to a stable, semver-governed API. Nothing is actually
breaking; the footer exists only so the release tooling promotes the version
to 1.0.0.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>

# [0.11.0](https://github.com/MMoMM-org/obsidian-orbital/compare/0.10.0...0.11.0) (2026-06-23)


### Features

* **dangling:** add fuzzy search box to the dangling links toolbar ([ad01bdf](https://github.com/MMoMM-org/obsidian-orbital/commit/ad01bdfd3dd3b17791f06d6dd234a97b44f03dbd))
* **settings:** add folder picker to New note folder setting ([fb98bb4](https://github.com/MMoMM-org/obsidian-orbital/commit/fb98bb47d83b92f23203ab8b601696246be57330))
