# Visual Pack SDK 1

Make your own Code Resonance visuals without touching Code Resonance. A visual pack is a folder with a `pack.json`
manifest; you install it locally with `scripts/pack.js` and choose it in the player's World DNA panel. Nothing is
downloaded or published: there is no marketplace.

| Kind | What you write | Runs | Needs approval |
|---|---|---|---|
| **declarative** | JSON only: parameters, palette, light, rendering technique and effect mapping for an existing family | in the player, inside the built-in world it tunes | no |
| **shader** | GLSL for a background and up to four post passes, an optional procedural effects module, on a built-in family | in the isolated pack frame | yes |
| **world** | a complete world family: a JavaScript module implementing the [World API](world-api.md), plus GLSL and textures | in the isolated pack frame | yes |

The reference packs in `packs/examples/` were written the way an outside developer would write them, from these pages
only: **Cymatic Field** (a world: every subsystem is a resonant plate whose sand settles on its nodal lines),
**Blueprint Cathedral** (a shader pack: Machine Cathedral as a living blueprint) and **Ember Observatory** (a
declarative pack: Stellar Forge through an old observatory lens).

## Quick start

```sh
node scripts/pack.js new my-world --kind world --id yourname.my-world --name "My World"
# edit my-world/pack.json and my-world/world.js
node scripts/pack.js validate my-world
node scripts/pack.js test my-world            # real browser, real recording (cd qualification && npm ci first)
node scripts/pack.js install my-world
node scripts/pack.js approve yourname.my-world   # code packs only: shows the files, digest and the isolation limits
```

Then open the player, choose **MY WORLD · PACK** under the world family (world packs) or under the look selector
(declarative and shader packs). `node scripts/pack.js list`, `revoke <id>` and `remove <id>` manage what is installed.
`--data <dir>` selects another receiver data directory.

## What your world receives

The [World API](world-api.md) is the same interface the three built-in families implement. Your world gets:

- **structure**: subsystems (districts), modules, symbols and dependencies, with the times they appear and are
  removed and the material state of each module (draft, committed, validated, stressed) at any time;
- **director commands**: the canonical intents (a subsystem created, tests failing, a verified milestone, a commit…)
  with the tier and scale the effect director allowed, named with your effect vocabulary; and the lasting
  transformations (verified milestones) so far;
- **agent presences**: connected, working, using a tool (reading, editing, testing…), waiting, departed;
- **the frame**: performance time, the music's beat and bar phase, energy, activity, idle or active, unlocked ambient
  layers, the adaptive quality level;
- **your recipe**: the parameters you declared, drawn for this project (optionally from its traits: size, coupling,
  UI share, tests, agent collaboration…), its palette, and the viewer's settings.

Everything arrives through the [privacy-safe view](security.md#the-performance-view): salted ids, counts, categories,
timings. Never file names, paths, source, prompts, the project's folder name, credentials or recordings.

## Contracts

- [World API](world-api.md): the functions your world implements and the `sdk` object it gets.
- [Manifest](manifest.md) and its JSON Schema `packs/schema/pack.schema.json` (point your editor at it).
- [Determinism](determinism.md): films and replays must render the same frame for the same moment.
- [Security](security.md): isolation, approvals, what the browser cannot sandbox.
- [Performance](performance.md): budgets, adaptive quality, what the tests measure.
- [Parameter catalogue](catalogue.md): what declarative packs may set on the built-in families.

## Compatibility tests

`node scripts/pack.js test <dir>` installs the pack into temporary copies of recorded projects (your receiver is not
touched) and checks, in a real browser: the manifest; installation (code packs start unapproved); isolation of code
packs (from inside the frame nothing reaches the receiver or an outside listener, no storage, cookies, WebRTC, workers
or popups, and a frame that navigates itself away is stopped); that the world expresses the recording's events,
including failures and verified milestones; that no label shows a folder name, path, file name or identifier; idle
life; that the image follows the beat; project-specific recipes; deterministic replay across seek histories; resource
release when the world is switched away and back four times; and the performance budget your manifest declares. The
report is written to `qualification/results/visual/pack-<id>.json`.
