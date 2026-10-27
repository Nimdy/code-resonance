# Integration manifest: the development stack into `main`

This file records what was integrated into `main` at the final consolidation, so the source of truth can be traced
back to the reviewed pull requests. It is a historical record, not instructions.

## Starting point (verified 2026-10-27, before any change)

| Item | Value |
|---|---|
| Repository | `Nimdy/code-resonance` (private), default branch `main` |
| `main` before integration | `07a2695200566d3bc5d2524447fdabd0bc2f4c2f` |
| Accepted Phase 11 head (PR #11) | `878a0b8a8acbcbb50597adb1c2249879532fdfa7`, tree `b07a43b9fb8065f6c032b58c5acbf35782ee3ba3` |
| Repository rules | Branch protection and rulesets are not available on this plan, so none apply. Merge commits are allowed |
| Native stacked pull requests | Not recognised: GraphQL `PullRequest.stack` is `null` for the chain. No API mutation creates a stack from existing branches without rebasing them |
| Integration method | Bottom-up: each pull request retargeted to `main` and merged with a merge commit, in dependency order. No rebase, squash or force-push |
| Tags and releases | None, before or after |

Every pull request's base was an ancestor of its head, so the chain had a linear history:

| PR | Branch | Base | Head | Commits over base | Head tree |
|---|---|---|---|---|---|
| #1 | `feat/baseline-audit-and-qualification` | `main` | `a6c0afeba806` | 22 | `26a53e1bf26c` |
| #2 | `feat/the-construct` | #1 | `1b531f01d451` | 12 | `540f866026d7` |
| #3 | `feat/living-worlds` | #2 | `a7c8cfe80229` | 14 | `47dd6fc18ede` |
| #4 | `feat/visual-pack-sdk` | #3 | `14fbe6d2bc09` | 7 | `17f923ed0c24` |
| #5 | `feat/product-hardening` | #4 | `0a71c5a2bfe9` | 22 | `c2d444effdde` |
| #6 | `feat/alpha-candidate` | #5 | `1501e5bb7796` | 14 | `7dc1619037fb` |
| #7 | `feat/creative-control-center` | #6 | `8330755f2651` | 10 | `dc0e56081d6d` |
| #8 | `feat/flagship-visual-spectacle` | #7 | `c544bfb999b2` | 20 | `cc315a519f31` |
| #9 | `feat/desktop-experience` | #8 | `1bac9809611c` | 12 | `d9ea79c7d346` |
| #10 | `feat/emergent-digital-life` | #9 | `1460cdcf0692` | 20 | `a0110aaf9ac6` |
| #11 | `feat/creative-mastering-artist-studio` | #10 | `878a0b8a8acb` | 84 | `b07a43b9fb80` |

**CI on PR #11's head:** every job green. Required validation: `node` (Linux), `windows`. Qualification: `browser`,
`runtime`, `ui`, `vscode`, and `packs` for all three reference packs. The `packs (ember-observatory)` job needed one
re-run after the runner's browser download exhausted its 30-minute limit.

## Versions at integration

The product, its data formats and its creative generators each carry their own version. They are independent: a new
score version does not change the product version.

| What | Version | Where |
|---|---|---|
| Product (`package.json`, the VS Code extension) | 0.5.0, not released | `package.json`, `extension/package.json` |
| Interpretation (how events become canonical intents) | 7 | `engine/reducer.js` `INTERPRETATION_VERSION` |
| Score | 2 (classic, frozen) and 3 (composed); a recipe without `music.score` plays 2 | `public/score.js` |
| Visual Recipe | schema `code-resonance.recipe.v1`, generator 4 (finish, score 3 and ecology 2 for new identities) | `engine/recipe.js` |
| Renderer | 1 | `engine/recipe.js` `RENDERER_VERSION` |
| Digital life | sim 1; ecology 1 (Phase 10) and 2 (music-driven), per identity | `public/worlds/life/` |
| Visual Pack SDK | 1.2.0; packs declare `^1.0`, `^1.1` or `^1.2` | `engine/packs.js` |
| Artist composition | `code-resonance.composition.v1` | `public/composition.js` |

## Result

The merge record (each PR's merge commit, the consolidation PR and the final `main` tree) is appended below once the
integration is complete.
