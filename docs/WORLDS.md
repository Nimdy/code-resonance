# Living worlds

Code Resonance draws each project as its own generative world: a persistent artistic identity derived from the code
(its Visual Recipe), rendered by one of several world families, alive between events, and transformed by what the
development actually does. Every structure is real project data; the worlds never invent progress.

**Status:** artistic candidates. Technical qualification (determinism, idle life, resources, privacy, performance) is
not artistic acceptance; that is a human judgement of the images, films and sound.

## Layers

| Layer | Where | What it does |
|---|---|---|
| 1. Observations | `extension/`, `scripts/hooks/claude-code.js`, receiver journal | Raw events, durable and private (unchanged) |
| 2. Semantics | `engine/reducer.js`, `engine/languages/` | AST structure per language adapter, provenance, validation, identities |
| 3. Canonical intents | `engine/intents.js` (recorded with each timeline window) | What should visibly change, world-independent, with tier, magnitude and evidence |
| 4. Visual Recipe | `engine/recipe.js`, `recipe.json` per project, `GET/POST /api/recipe` | The project's persistent artistic identity |
| 5. World model | `public/worlds/model.js` | What exists at a performance time (districts, modules, symbols, links, states) |
| 6. Effect director | `public/worlds/director.js`, `public/worlds/agents.js` | Intents to family effects, proportion and rarity; agent presences |
| 7. Renderer and camera | `public/worlds/core.js`, `stellar.js`, `biosphere.js`, `cathedral.js` | HDR pipeline, shaders, instancing, cinematic camera |
| 8. Music sync | `public/score.js`, `public/music.js` | One performance clock; section and beat drive light and pulse |
| 9. Presentation | `public/worlds/host.js`, `public/app.js`, `qualification/visual/film.js` | Cinematic, explorer and stream labels; replay; films |

A new world family is one file implementing the family contract (`rebuild`, `update`, `effect`, `cameraGoal`,
`describe`, ...); it never touches capture or semantics. A new event kind needs an intent in `engine/intents.js`
and, optionally, one line of vocabulary per family in `engine/recipe.js`.

## Visual Recipe (World DNA)

A recipe is a pure function of (project seed, variant, founding traits, family) and is stored per project. It holds
the family, the family's genome (geometry language, spatial organisation, materials, atmosphere, motion, camera
personality, agent form, effect vocabulary), a palette, light and grade, ambient layers and milestone unlocks,
music reactivity, complexity limits, and the viewer's overrides (spectacle intensity, motion, labels), aliases for
subsystems and a title.

- **Permanent vs temporary.** The recipe says what kind of universe the project is. What the project is doing
  (growing, failing, recovering, idle) is state read from the timeline at render time and never changes the recipe.
- **Founding.** While a project has fewer than 6 modules the generated recipe is provisional (re-derived on request);
  then it is founded and never re-derived. A chosen or locked recipe is permanent at once.
- **Artist control.** The World DNA panel (and `POST /api/recipe`, same origin only) offers: automatic, choose a
  family, regenerate (a new seeded draw, `variant`), lock, spectacle intensity 0-200 %, information mode, subsystem
  aliases and a title. Inputs are validated; aliases are restricted to letters, digits and basic punctuation.
- **Reproducibility.** `film.js` writes the exact recipe next to every film (`<film>.recipe.json`) and can render
  with a pinned recipe (`--recipe`).

### From data to identity

Traits come from the public projection only (salted ids, no paths): module count, districts, UI-component surface
(share of modules with components), service endpoints, classes/interfaces/types, functions, language mix (extension
families), dependency and cross-district density, hubness (largest in-degree), folder branching, symbols per module,
test share, observed agents and the share of events they produced.

| Family | Affinity (weights set by hand, documented in `familyScores`) | Character |
|---|---|---|
| Stellar Forge | hubs (0.9), service endpoints (0.7), agent share (1.2), youth (0.45), functions (0.25) | gravity: systems around hubs, work arriving from visiting agents |
| Fractal Biosphere | UI surface (1.2), folder branching (0.6), size (0.3), TSX/JSX (0.25) | growth: a large surface of small parts |
| Machine Cathedral | classes/types (0.8), tests (0.7), cross-district coupling (0.5), depth (0.25) | engineering: ordered, coupled, tested structure |

A seeded share (up to 0.25) is added to each score so similar projects can still become different universes; when
the data is ambiguous the seed decides. The weights were chosen by hand with the three demonstration projects in
view; they encode the intent above, not a learned model.

## World families

### Stellar Forge

| Data | Image |
|---|---|
| Subsystem | A star; temperature from its contents (interface blue-white, services gold, model orange, logic pale yellow, tests violet), size from its symbols; it ignites when created |
| File | A planet on a Kepler orbit around its subsystem's star, orbit from its persisted plot (ring and bearing); surface from content (UI banded gas giant, types crystal, tests ice, functions terran, no symbols moonlet); API routes are polar jets |
| Symbol | A moon or ring particle in stable slot order; it spirals in when created |
| State | Draft: molten protoplanet; committed: cooled world; validated: aurora; stressed: storms |
| Dependency | An energy ribbon between two planets; across subsystems a plasma bridge |
| Agent | A comet: halo orbit while working on a request, at the planet it reads or edits while a tool runs, parked at the system's edge while waiting |

The recipe's arrangement shapes the galaxy (spiral arms, a ring, two cores with tidal streams, or a spheroidal
cluster) and the systems are packed on that same structure so neighbours never overlap. Ambient: a nebula with
filaments and dark lanes, a dust and gas disc, star convection and coronae, orbital motion, twinkling stars.
Milestones unlock aurora veils, plasma currents, a pulsar and a halo.

### Fractal Biosphere

| Data | Image |
|---|---|
| Subsystem | An organism rooted at its persisted site; species from the recipe (coral, fern, kelp, mycelial, crystal-tree) |
| Folder | A limb from the trunk, in the order the folder first appeared; the trunk grows with the folders |
| File | A branch from its folder's limb; long files fork into twigs |
| Symbol | A leaf in slot order: components blossom, classes bear pods, routes raise stamens, interfaces and types are translucent fronds |
| State | Draft: pale new growth; validated: glowing leaves; stressed: blight, drooping leaves |
| Dependency | A tendril; between organisms at most four braided vines per pair, brighter for more links |
| Agent | A firefly swarm gathered at the branch it reads or edits |

One continuous current field sways every vertex by its rest position, so connected parts stay connected. Ambient:
a dark veined ground, spores, nutrient pulses, breathing leaves, light shafts. Verified milestones leave lasting
fractal blooms on the organism and unlock fireflies, drifting petals, canopy veins and a bioluminescent tide.

### Machine Cathedral

The Construct's visual language on the new engine: districts are luminous plots on a survey ground, files are towers
whose storeys are their symbols (floors, blocks, glass, open frames, plates, roof spires, a crown for overflow),
drafts show scaffold edges, validated towers light their windows, failing runs show red strain; conduits stay low,
bridges arc between rooftops; agents are drones. Ambient: fog, motes, breathing windows, conduit flow, mechanism
rings around the tallest towers; milestones unlock searchlights and glass aurora. The original Construct
(`public/construct.js`) is kept unchanged as a selectable world for comparison.

## Semantic fidelity

Intents are emitted by the reducer next to the facts that justify them and recorded with the timeline.

| Intent | Tier | Evidence | When |
|---|---|---|---|
| `module.created` / `module.removed` / `module.renamed` | 1 / 1 / 0 | observed | a file appears, is deleted, or keeps its identity across a rename |
| `subsystem.created` | 2 | derived | the first module of a new district (not on baseline indexing) |
| `structure.created` / `modified` / `removed` | 1-2 / 0 / 1 | derived | AST diff of a snapshot; tier 2 only for components, routes, classes |
| `structure.linked` / `subsystem.connected` | 0 / 2 first, 1 repeat | derived | a resolved dependency inside / across districts |
| `validation.failed` | 2 | verified | an observed non-zero exit of a test, build, typecheck or lint |
| `validation.passed` | 0-2 | verified | an observed exit 0; tier 0 for a re-run with nothing new |
| `validation.recovered` | 3 | verified | a pass after a failure, with the repaired module count |
| `refactor.validated` | 3 | inferred, verified by a test run | 3+ symbols removed since the last run, then a pass |
| `milestone.achieved` | 3, rarely 4 | verified | a passing run plus a structural reason (first validation, integration validated, recovery, refactor); tier 4 needs several together |
| `repository.checkpoint` | 2 | observed | a commit, magnitude from structure since the last commit |
| `agent.state` | 0 | observed | hook-reported lifecycle and tool activity |
| `world.expanded` | 2 | derived | accumulated structure reaches a new chapter (growth, not completion) |

Rules that keep the worlds honest: a failure never produces a success effect; no agent message, visible thinking or
response can produce a validation; typing and newlines produce no structure; a huge generated file saturates; re-runs
are micro; only verified milestones unlock ambient layers; time alone never creates an effect (tested).

The director scales effects by evidence: micro and routine effects coalesce per subject, structural effects have
cooldowns, milestones spend a spectacle token (three, one regained per 90 s), rare effects need three tokens and ten
minutes since the last one, and the viewer's spectacle intensity scales everything.

## Agents

Presences follow observed lifecycles only (`engine/intents.js`, `public/worlds/agents.js`): connected, working on a
request (prompt submitted, no response yet), using a tool (reading, searching, editing, running, testing, building,
checking, researching, delegating), reasoning (only when the provider exposed it, labelled "reasoning (visible)"),
waiting for the next prompt, finished (subagents), disconnected. After three silent minutes a busy agent reads
"status unknown" and dims; a waiting agent goes dormant after two; a disconnected agent departs. The Claude Code hook
now names the file a `Read` looks at, so reading is visible; only edits attribute later changes to an agent.

## Labels and privacy

Modes: **cinematic** (title card, callouts for structural events and above, milestone banners, agent chips when
their activity changes), **explorer** (subsystem labels always, click to inspect a structure), **stream** (a lower
third: project and family, current event, agent status, validation status), **off**. Text comes only from roles,
counts, states, activity categories, generated names (pronounceable, derived from salted ids, filtered against crude
words) and user aliases. No path, file name, prompt or source identifier is ever drawn (checked in qualification).

## Music

The score is unchanged. The synthesis is rebalanced for small speakers (see `qualification/results/audio/balance.json`)
and the energy relaxes after 15 s without a new frame.

## Qualification

See `docs/QUALIFICATION.md` for commands and measured results.
