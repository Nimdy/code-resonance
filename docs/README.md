# Documentation

The current documentation of Code Resonance, and where the history of its milestones is kept. Product overview and
quick start: the [README](../README.md).

## Start here

| You want to | Read |
|---|---|
| See and hear it first, in the browser, with nothing installed | [Web demo](WEB-DEMO.md) |
| Install it, pair a browser, capture, hear, record, stream; fix a setup problem | [Getting started](FIRST-RUN.md) |
| Run one overnight CAST session and a later OBS night (README hero is the 70 s Pulse CAST film) | [0.7.0 campaign](campaign-0.7.md) |
| Know where data lives, back up, update, roll back, read diagnostics; what is supported and what is not | [Operations](OPERATIONS.md) |
| Publish the VS Code extension on the Marketplace and Open VSX | [Publishing](PUBLISHING.md) |
| Understand the architecture, the versions, the HTTP API; extend it; run focused checks | [Developer guide](../ARCHITECTURE.md) |
| Compose your own look | [Artist Studio](ARTIST-STUDIO.md) |
| Understand and tune the music | [Music](MUSIC.md) |
| Make or install a visual pack | [Visual Pack SDK](packs/README.md) |
| Know what is captured, stored and shown | [Security and privacy](../SECURITY.md) |
| See what was verified, milestone by milestone | [Qualification history](QUALIFICATION.md) |

## By audience

- **Using it:** [Getting started](FIRST-RUN.md), [the 0.7.0 campaign runbook](campaign-0.7.md), [Operations](OPERATIONS.md),
  [the Control Center and the Stage](CONTROL-CENTER.md) (workspaces, where each setting lives), [Recording](RECORDING.md),
  [OBS](OBS.md), [Windows with WSL2](WSL.md).
- **Creating:** [Music](MUSIC.md), [the living worlds](WORLDS.md), [digital life](LIFE.md), [the Artist
  Studio](ARTIST-STUDIO.md), [the Construct](CONSTRUCT.md), and the Visual Pack SDK: [overview](packs/README.md),
  [manifest](packs/manifest.md), [World API](packs/world-api.md), [determinism](packs/determinism.md),
  [performance](packs/performance.md), [parameter catalogue](packs/catalogue.md), [SDK 1.2 and 1.1](packs/migration.md).
- **Developing:** [contributing](../CONTRIBUTING.md), [the developer guide](../ARCHITECTURE.md), [one engine, many views](CONTROL-CENTER.md#one-engine-many-views),
  [digital life's determinism contract](LIFE.md#determinism), [how a composition is
  rendered](ARTIST-STUDIO.md#how-a-composition-is-rendered), the pack [World API](packs/world-api.md) and
  [determinism](packs/determinism.md) rules, [the repository workflow](../REPOSITORY.md).
- **Security:** [the security and privacy model](../SECURITY.md), [visual pack isolation](packs/security.md).

The Control Center opens a subset of these itself (Settings › Documentation and each workspace's guide buttons): Getting
started, Operations, the 0.7.0 campaign, OBS, Recording, WSL, Security and privacy, Music, Artist Studio and the pack
SDK pages. It shows them as text without images, and a link to a document it does not serve as plain text.

## Creative questions

| Question | Answer |
|---|---|
| How do I choose or customise a world? | [Getting started › Make it yours](FIRST-RUN.md#make-it-yours); the worlds: [WORLDS.md](WORLDS.md) |
| How do I tune the music? | [The performance profile](MUSIC.md#the-performance-profile-music-studio) |
| How do I create an original composition? | [The Artist Studio](ARTIST-STUDIO.md) |
| How do I save or restore versions? | [Preview, save, apply, cancel](ARTIST-STUDIO.md#preview-save-apply-cancel) |
| How do I share a creation? | [Share: export and import](ARTIST-STUDIO.md#share-export-and-import) |
| What is a data-only pack? | [Declarative packs](packs/security.md#declarative-packs-data-only) and the kinds of pack in [packs/README.md](packs/README.md) |
| When does executable approval apply? | [Shader and world packs](packs/security.md#shader-and-world-packs-code) |
| How do I use my creation in OBS? | Apply it to the project, then [OBS](OBS.md) |

## Versions

The product version (0.8.1) is not the version of the interpretation (11), the score, the Visual Recipe
generator, digital life, the Visual Pack SDK or the composition format. Each is listed, with the rule that keeps older
identities as they were: [ARCHITECTURE.md › Versions and compatibility](../ARCHITECTURE.md#versions-and-compatibility).
The last published GitHub Release before the 0.7 series is 0.6.0 (`v0.6.0`).

## History

The milestones were developed as a stack of eleven pull requests, integrated into `main` at the final consolidation
([integration manifest](history/integration-manifest.md)). The documents call them by phase numbers that are not
consistent, so the pull request is the key here. 0.7.0 and 0.7.1 are the CAST campaign after that stack, plus pairing
proof, ecology CI, and highlight/label hardening: [campaign-0.7.md](campaign-0.7.md). 0.7.2 adds the token proof
for every client, interpretation 9, hover details and the agent touch, the redrawn Monolith, the MIT License and two
preview worlds, Synaptic Storm and Fractal Continuum. 0.8.0 adds the web demo, an extension that is enough on its
own, six more agents, nine more languages and deeper Python (interpretation 10), vertical clips, recording to a file on
disk and a third preview world, Temporal Terrain. 0.8.1 (this tree) graduates the three previews: generator 5 can
choose them, and each is inhabited by digital life of its own ([CHANGELOG](../CHANGELOG.md)). The interpretation is
independent of the product version.

| PR | Milestone | Qualification | Changelog | Evidence in the repository |
|---|---|---|---|---|
| #1 | Baseline audit and qualification (0.3.0) | [the first six sections](QUALIFICATION.md#vs-code-extension-host-real) | 0.3.0 | [AUDIT.md](AUDIT.md), [history/v0.2.0/](history/v0.2.0/README.md), `qualification/results/` |
| #2 | The Construct | [The Construct](QUALIFICATION.md#the-construct-candidate-visual-world) | 0.4.0 › The Construct | [CONSTRUCT.md](CONSTRUCT.md), `docs/construct/` |
| #3 | Living worlds (Phase 3) | [Living worlds](QUALIFICATION.md#living-worlds-phase-3-artistic-candidates) | 0.4.0 › Living worlds | `docs/worlds/*.jpg` and `docs/worlds/recipes/` ([WORLDS.md](WORLDS.md#frames-from-the-pr-3-living-worlds-historical)) |
| #4 | Visual Pack SDK, long histories, privacy (Phase 4) | [Privacy repair](QUALIFICATION.md#privacy-repair-phase-4), [Long histories](QUALIFICATION.md#long-histories-phase-4), [Visual packs](QUALIFICATION.md#visual-packs-phase-4-artistic-candidates) | 0.4.0 › Visual Pack SDK 1 | `docs/packs/images/` |
| #5 | Product hardening | [Product hardening](QUALIFICATION.md#product-hardening-recording-bounded-pack-runtime-platforms) | 0.4.0 › Product hardening | [security review](history/security-review-pr5.md) |
| #6 | Alpha candidate (0.4.0 alpha 1, never tagged) | [Alpha candidate](QUALIFICATION.md#alpha-candidate-memory-synchronisation-recording-sizes) | 0.4.0 › Alpha candidate | [the alpha notes](history/ALPHA-0.4.0.md) |
| #7 | Creative Control Center (0.5.0, Phase 6) | [Creative Control Center](QUALIFICATION.md#creative-control-center-phase-6) | 0.5.0 | [docs/control-center/](control-center/README.md) |
| #8 | Flagship worlds | none (the approved films are referred to under Digital life) | 0.6.0 › Flagship worlds | [docs/worlds/spectacle/](worlds/spectacle/README.md) |
| #9 | Desktop experience | [Auto quality](QUALIFICATION.md#auto-quality-desktop-milestone) | 0.6.0 › Desktop experience | [docs/desktop/before/](desktop/before/README.md), [after/](desktop/after/README.md) |
| #10 | Digital life (Phase 10) | [Digital life](QUALIFICATION.md#digital-life-phase-10) | 0.6.0 › Digital life | films kept locally (`qualification/results/films/life/`) |
| #11 | Creative mastering and the Artist Studio (Phase 11) | [Creative mastering](QUALIFICATION.md#creative-mastering-and-the-artist-studio-phase-11) | 0.6.0 › Creative mastering | [docs/media/](media/README.md), cut from the review films kept locally |

The screenshot sets are regenerated by `qualification/ui/screenshots.js` (into `docs/control-center/`),
`ui/workspace-shots.js` (into `docs/desktop/after/` unless `--out` says otherwise) and `ui/world-shots.js` (into
`docs/worlds/spectacle/`); `visual/recipes.js` rewrites `docs/worlds/recipes/`. Running them overwrites historical
evidence: give another output folder, or restore the files before committing.
