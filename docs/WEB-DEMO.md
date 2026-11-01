# Web demo

**<https://nimdy.github.io/code-resonance/>** (deployed from `main`: see [Going live](#going-live)).

A page anyone can open: the real player, in the browser, replaying a real recorded project with its music. Nothing is
installed and nothing is sent anywhere. It opens on the Performance Stage replaying *Lumen Recipes*, a real
four-minute session in which six Claude Code agents built a small recipe app
([qualification/recordings/lumen-recipes](../qualification/recordings/lumen-recipes/README.md)). The replay plays
silently behind a short introduction; **Start the performance** turns the music on (browsers need a click for sound)
and plays it from the beginning, and it starts again when it ends.

On the Stage: the six world families (Stellar Forge, Fractal Biosphere, Machine Cathedral, Synaptic Storm, Fractal
Continuum and Temporal Terrain), the Aurora preview, the Construct and Monolith; replay speed (1×, 4×, 16×) and
scrubbing; information modes; quality (Auto lowers it while frames are slow, and offers Monolith on a machine that
cannot draw the living world smoothly); sound; full screen; recording the stage to a WebM file (in the browser, as in
the application). On a phone the worlds are a menu instead of nine buttons.

What is not there, because it needs Code Resonance running on your own computer: the Control Center (Home, the
Visual, Artist and Music Studios, packs, connections, settings), live mode, pairing, and anything saved. A world chosen
in the demo lasts until the page is closed. To watch your own project: [Getting started](FIRST-RUN.md).

## How it is built

`npm run site` (`scripts/build-site.js`, Node only, no dependencies) writes the site to `site/` (ignored by Git):

1. The recording is copied into a temporary data directory (`/tmp/cr-site-*`, removed afterwards) and a receiver is
   started on it in the same process, on a free loopback port (never 4174). It interprets the journal as it would on
   your machine.
2. The recording gets the world it opens on, Stellar Forge, and its public title, *Lumen Recipes*, the way the Visual
   Studio gives them (a recipe has no title until someone names it). Generator 5 alone would choose Temporal Terrain
   for this recording; choosing Stellar Forge keeps the genome the demo has served since 0.8.0
   (`DEMO_FAMILY` in `scripts/build-site.js`).
3. Every answer the Stage reads for a replay is fetched from that receiver and written to `site/api/`, with
   `site/api/index.json`, which maps each request (its path and its query parameters, sorted) to its file:

   | Request | Why the Stage asks |
   |---|---|
   | `GET /health` | the interpretation delay |
   | `GET /api/projects` | the project list (the store selects the only project) |
   | `GET /api/project?id=` (with its `ETag`) | the project's model, polled every 3 s |
   | `GET /api/timeline?id=&after=-1&limit=500` | the replay, page by page as the player asks (one page: 41 windows) |
   | `GET /api/timeline?id=&after=-1&limit=2000&fields=intents` | the history's intents (live mode, before the switch to the replay) |
   | `GET /api/timeline?id=&after=40&limit=200` | the live poll after the last window (empty) |
   | `GET /api/recipe?id=` | the identity: the saved one, and the same identity in each of the six families and the preview |
   | `POST /api/recipe/preview?id=` with one `family` action | each family's preview (recipe, tunable parameters, runtime) |
   | `GET /api/catalog`, `/api/settings`, `/api/presets`, `/api/compositions`, `/api/packs` | what the interface loads at start |
   | `GET /api/preferences?id=`, `/api/evidence?id=`, `/api/highlight?id=` | what selecting a project loads |
   | `GET /api/status` | the receiver's status, without what describes the building machine (Node, platform, port, times) |

4. `public/` is copied beside them, and `site/index.html` is `public/index.html` with relative URLs, a content policy
   (`connect-src 'self'`), and the static mode loaded before the engine. The build fails if `public/index.html` no
   longer has the shape it edits, or if any page, script or stylesheet would load something from the server's root
   (a module import, a stylesheet, a script): GitHub Pages serves the site under `/code-resonance/`.

The same recording always builds the same files, byte for byte (a recipe's creation time is pinned to the recording's
last moment). The site is about 3.5 MB (114 files; three.js is 0.7 MB of it); a visit that tries every world loads
about 2.5 MB of it.

The player itself is unchanged: the receiver serves it at `/` as before. Its module imports and workspace stylesheets
are relative (`./worlds/host.js`, `css/stage.css` from `public/ui/dom.js`), which are the same URLs from the receiver
and work under any path in the site.

## What is static

`public/web-demo/` holds the only code the site adds; the receiver never serves it:

- **`static-api.js`** runs before the engine. `GET /api/*` and `/health` are answered from the exported files (each
  read once, then from memory); `/api/project` answers 304 to its own `ETag` as the receiver does; a request that was
  not exported answers 404 without reaching the network. `GET /api/recipe` answers the identity in the family chosen
  last. `POST` is inert: a control session is granted (there is nothing to protect), choosing a family switches the
  world for this page, a single-family preview answers its exported candidate, settings, preferences, presets and
  compositions answer what they hold unchanged, and anything else answers 403 saying it needs Code Resonance on your
  own computer. The change feed (`EventSource /api/changes`) is a stand-in that opens once and stays quiet. Any route
  other than `#/stage` leads back to the Stage.
- **`demo.js`** and **`demo.css`** are the landing: the introduction, the site's name and links in the Stage's top bar,
  the nine worlds in place of the Stage's three-way choice, no Live, Control Center or new-window controls, Esc that
  never leaves the Stage, and the replay starting again at its end.

## Rebuild and preview

```bash
npm run site                                   # builds site/ (well under a second)
node scripts/build-site.js --serve             # builds, then serves it at http://127.0.0.1:<free port>/code-resonance/
node scripts/build-site.js --serve --port 4180 # a fixed port (never 4174, the receiver's)
node --test tests/web-demo.test.js             # the export and the static mode, without a browser (part of npm test)
cd qualification && node site/web-demo.qual.js # a real browser: desktop and phone, every world (add --gpu for the GPU)
```

`qualification/site/web-demo.qual.js` builds the site into a temporary folder, serves it under `/code-resonance/` and
checks, in headless Chromium: no failed request, no request outside the site path, no page error; Start runs an
AudioContext and the replay advances; each world, chosen with the landing's own buttons, renders a picture that is not
blank while the replay advances; on a phone-sized screen (390×844, touch) nothing scrolls sideways, the controls fit,
Start plays and a world chosen from the menu renders. Screenshots and `notes.json` go to
`qualification/results/lab/web-demo/` (ignored by Git). With `--gpu`, a run that falls back to SwiftShader fails.

## Going live

`.github/workflows/pages.yml` builds the site with `npm run site` and deploys it with `actions/upload-pages-artifact`
and `actions/deploy-pages`, on every push to `main` that changes `public/`, `engine/`, `receiver/`,
`scripts/build-site.js`, the recordings or the workflow, and by hand (Actions › pages › Run workflow). It never runs on
pull requests, and only in `Nimdy/code-resonance` (not in forks).

The one step the owner does, once: **Settings › Pages › Build and deployment › Source: GitHub Actions**, then run the
workflow once by hand. **Not *Deploy from a branch*:** with a branch as the source, GitHub builds the repository with
Jekyll on every push to `main` and publishes the README as the site, over the demo. That happened on 2026-10-31: the
demo was live after #30's merge (checked in a headless browser: no failed request, no request outside the site, no
page error, and after *Start the performance* Stellar Forge drew the replay of *Lumen Recipes*), and the next merges
replaced it with the README. `gh api repos/Nimdy/code-resonance/pages` shows which source is set: `build_type` must be
`workflow`, not `legacy`.

## Privacy

- Only the public recording is published: the answers a browser's Stage reads from a receiver for it, which are
  derived views (structure as hashed identities, catalog and generated names, the score's inputs; no file name, path,
  source, prompt or command, as on the Stage everywhere). The one name in them is the recorded folder's,
  `lumen-recipes`, in the project list the Control Center reads (the Stage never shows it; the recording's README
  names it too). No journal, no content blob, no key or token, no data from anyone's machine. The recording itself is
  already in this repository.
- The page reads only its own files. Its content policy allows no connection to any other site; it has no analytics,
  no cookies and no third-party requests. Links to GitHub open GitHub when you click them. GitHub Pages, as the host,
  receives the requests for the site's files like any web host.
- Choices made in the demo (the world, the information mode) are not stored anywhere. The interface keeps its own
  state in the browser's local storage, as in the application (the quality chosen on this device, the last project).
