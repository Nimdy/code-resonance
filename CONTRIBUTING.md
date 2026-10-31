# Contributing

Code Resonance turns real software development into a live audiovisual performance. Contributions are welcome, from a
bug report to a new world. This page explains how the project is built and what a pull request needs.

## Good places to start

| You want to | Where | Guide |
|---|---|---|
| Make your own visuals, no core changes | a visual pack: declarative JSON, a shader pack or a whole world | [Visual Pack SDK](docs/packs/README.md), `node scripts/pack.js new` |
| Teach it a language | `engine/languages/`: one adapter per language, dependency-free | [the adapter contract](engine/languages/index.js) |
| Bring another AI agent on stage | `scripts/hooks/`: an observe-only adapter and its installer | the Claude Code, Cursor and Codex adapters |
| Fix or improve the player, a world or the music | `public/` | [Developer guide](ARCHITECTURE.md), [the living worlds](docs/WORLDS.md), [Music](docs/MUSIC.md) |
| Report a problem | GitHub issues (templates ask for what helps) | [Getting started › Troubleshooting](docs/FIRST-RUN.md#troubleshooting) |

Security problems go to private vulnerability reporting, never a public issue: [SECURITY.md](SECURITY.md#reporting-a-vulnerability).

## Set up

You need Node 20 or newer. Nothing else is installed for the product itself.

```sh
git clone https://github.com/Nimdy/code-resonance.git && cd code-resonance
npm run up          # receiver on 127.0.0.1:4174, the VS Code extension, a pairing link
npm test            # unit and integration tests, no dependencies
npm run check       # syntax check of every first-party JavaScript file
```

The browser, VS Code and OBS qualification lives in `qualification/`, with its own dependencies (Playwright,
ffmpeg-static): `cd qualification && npm ci`. Most suites start an isolated receiver on a temporary data directory;
none of them should touch `~/.code-resonance`. The commands for each harness are in
[ARCHITECTURE.md › Qualification](ARCHITECTURE.md#qualification).

## The rules a change is held to

- **No runtime dependencies.** The product (`receiver/`, `engine/`, `public/`, `extension/`, `scripts/`) uses Node's
  built-ins and the vendored three.js and TypeScript only. Test tools stay in `qualification/`.
- **Privacy first.** Source text, typed text, prompts, command text and file paths never reach the Stage, OBS, films or
  exports. Agent adapters forward paths and outcomes only, never prompts, patch bodies or command text. Public labels
  use catalog names and generated names. If a change touches what is captured or shown, update
  [SECURITY.md](SECURITY.md).
- **Identities are permanent.** A project's musical and visual identity never changes once made: the pinned tests
  (`tests/recipe.test.js` and others) must pass unedited. Changing how the same journal is interpreted means a new
  interpretation version (`engine/reducer.js`), which rebuilds derived files from the journal. The other versions
  (score, recipe generator, digital life, SDK) have their own rules: [ARCHITECTURE.md › Versions and
  compatibility](ARCHITECTURE.md#versions-and-compatibility).
- **Observe-only agents.** An adapter never prints where the agent reads it, always exits 0, and is never installed on
  an event where its silence could block or deny the agent.
- **Evidence, not claims.** A pull request says what was run and what it showed: test counts, measurements,
  screenshots or stills for anything visual. What was not verified is stated as such.
- **Match the code around you.** Compact code. Comments explain why, not what. Keep the names already in use.

## Pull requests

1. Branch from `main`. Keep one topic per pull request.
2. Add a test that fails without your change, when the change is testable.
3. Update the docs it affects, and add a line under `## Unreleased` at the top of [CHANGELOG.md](CHANGELOG.md).
4. Run `npm run check` and `npm test`; for visual or UI changes, run the matching qualification suite or attach stills.
5. Open the pull request with the template's questions answered. CI runs the unit tests on Linux and Windows and the
   quick browser and VS Code qualification. Pull requests are merged with merge commits; history is never rewritten.

Contributions are released under the [MIT License](LICENSE), like the rest of the project.
