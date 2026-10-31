# Recording: how it works, what it guarantees, how it is measured

## Using it

**Record** (in the top bar, on the Stage, or in **Record & Broadcast**) records what the stage shows (the world and its
labels, for every world and every kind of visual pack) together with the music, to a WebM file (VP9 video, Opus sound)
that downloads when you stop. One window records at a time.

**Recording profile** (Record & Broadcast; the global default in Settings): *720p* (1280×720, the default), *1080p*
(1920×1080), *Vertical* (1080×1920, 9:16: see [Vertical clips](#vertical-clips-916)) or *Stage size*. At 720p
or 1080p the world renders at exactly that size with a 16:9 camera (the living worlds, visual packs and the
Construct), and the stage shows the same picture letterboxed while you record: what you see is what is recorded,
nothing is stretched, cut or bordered in the file. Monolith, the 2D world, keeps the stage's shape and is fitted into
the frame with black bars (at Vertical it is drawn upright at 1080×1920 too). Labels scale with the output, so 720p and
1080p have the same composition.
*Stage size* records the stage as it is on screen (any aspect ratio). Video bitrate: 5 Mbit/s at 720p, 8 Mbit/s at
1080p, in proportion for the stage size. Adaptive quality may lower the world's internal resolution while frames are
slow; the file keeps the chosen dimensions.

720p is the default because it holds 30 frames per second on modest GPUs: on the AMD integrated GPU used for testing
(measured with the worlds of PR #6, before the flagship worlds), every world recorded at 30 fps at 720p, while at
1080p the built-in worlds (rendered on the player's main thread) drew about 31 frames a second and the file kept 26-28
(visual packs, rendered in their worker, still recorded at 30). If a
recording cannot keep up (fewer than 28 frames drawn per second for ten seconds), the player says so once and suggests
720p or a lower Quality. The browser keeps the recording in memory until you stop (see *Limits*); for sessions longer
than about half an hour, record with OBS.

If the sound stops reaching the recording (an audio device disconnected or stalled), the browser's recorder would stall
the whole file, so the player finishes and saves the recording at that moment and says why.

## Vertical clips (9:16)

A coding night, posted: a 1080×1920 clip of the project's best moment with its music, for Instagram Reels, YouTube
Shorts and TikTok. Two ways to make one:

- **`npm run film -- --project <id> --vertical`** (or `--aspect 9:16`): the publish path. The same highlight Home plays
  (`engine/highlight.js`), cut to `--duration` seconds of film (default 30, from 3 to 180) at the highlight's speed and
  centred on its key moment: of the moments that made the night score (a recovery, a milestone, a meeting of agents, a
  new structure, a checkpoint), the one whose 30-second clip scores highest by the same rules. Near an end of the
  recording the clip shifts to stay inside it; a recording shorter than the clip gives all of it. The clip opens on the
  living world's title card (the public title and the family), and its last 3 seconds are an end card: the public
  title and *Code Resonance* over the dimmed world (the labels give way to it). The music is faded in over 1 second and
  out over the last 2.5.
  Output: `qualification/results/films/last-night-vertical.mp4`, **H.264 (High profile, CRF 18, yuv420p) and AAC
  192 kbit/s in MP4** with the index at the front (`+faststart`), which the bundled ffmpeg (ffmpeg-static 6.0) encodes;
  `--format webm` (or an `--out` ending in `.webm`) gives VP9 and Opus instead. `--size 540x960` renders a smaller
  preview. Like every film it needs a public title (`--allow-untitled` otherwise, and the end card then says only
  *Code Resonance*), always renders from a `--copy`, and accepts `--gpu`, `--labels`, `--world living|construct|city`
  and `--family <id>`.
- **Record** with the **Vertical** profile: the live recorder at 1080×1920 (8 Mbit/s), what the stage plays now. The
  browser saves WebM (VP9 and Opus), which YouTube and TikTok take; Instagram wants MP4, so use the film for Reels or
  convert the file.

**Framing.** A frame taller than it is wide is a portrait, and every world frames it for itself; a landscape frame is
drawn exactly as before (a film rendered with the default arguments gives the same frames as 0.7.2, byte for byte).

| World | In a portrait frame |
|---|---|
| Fractal Biosphere | composed as a square frame with the anchor organism centred (not on a third); the host then keeps the field of view across the width, so the camera stays where a landscape view puts it, in front of the giant far organisms |
| Stellar Forge | the galaxy seen from about 22° higher over the disc, far enough that its central 85 % fills the width, the core centred; what changed fills the width |
| Machine Cathedral | the standpoint 1.4 times further back, the field of view fitted to 80 % of the city's angular width (up to 66°), the spires under the top fifth, the reflections filling the water below; close-ups fit the width |
| Synaptic Storm, Fractal Continuum, visual packs | the host's rule for worlds that do not frame portraits themselves (`framesPortrait`): the field of view is kept across the width, so what the world framed for a landscape frame's height fills the portrait's width (a 34° view becomes 57° tall) |
| Construct | the site fitted to 90 % of the width and centred a little above the middle |
| Monolith | the title, counts and districts stacked under the top 12 %, the skyline across the middle, the dependencies below it, the legend above the bottom fifth |

**Words.** In a portrait frame the labels, chips, captions, banners, the title card and the end card are sized by the
short side (1.4 times their landscape size at 1080 wide, so they read on a phone) and kept inside the area the
platforms leave clear of their own interface: under the top 12 %, above the bottom 20 %, 6 % from the left edge and
10 % from the right (where their buttons are). A line wider than that area is drawn smaller; a callout stands over its
point (or under it near the top), clear of the words already placed, and becomes the caption where it cannot fit. The
rules are in `public/worlds/labels.js` (`textScale`, `safeArea`, `portraitPlaces`) and tested in
`tests/vertical.test.js`.

**Not verified:** uploading to Instagram, YouTube or TikTok (nothing here talks to them), and how each platform's
interface overlaps a clip on a given phone: the safe area is a conservative common margin, not a platform
specification.

## Architecture

1. **Picture.** After each presented frame the player draws it into one player-owned 2D canvas: the built-in worlds'
   canvases (world and labels), or the bitmap a visual pack's worker composited (world and labels) and returned with the
   frame's acknowledgement. Pack isolation is unchanged: the player receives pixels, never pack code or pack access.
2. **Capture.** That canvas is captured with `captureStream()`: a video frame each time it changes, timestamped at
   capture. The player draws it at most 30 times a second (every presented frame when it presents fewer). Chromium's
   `captureStream(30)` kept only every other frame of a canvas drawn from `requestAnimationFrame`, whatever the rate
   (3 of 6 frames a second on a software renderer).
3. **Sound.** The music's own output (a `MediaStreamAudioDestinationNode` on the same audio graph the speakers get), so
   the recording has exactly the music you hear, with no second clock. Each recording takes its own clone of the track.
4. **Encoding.** `MediaRecorder` muxes both tracks into WebM, using each track's capture timestamps.

## Clocks

| Stage | Clock | Conversion |
|---|---|---|
| Performance timeline | performance time (ms): live = wall clock − 10.5 s; replay = a playhead advanced each animation frame by elapsed × speed, and extrapolated between frames | — |
| Music scheduling | Web Audio `currentTime` | at scheduling: `when = currentTime + (eventTime − performanceNow) / speed` |
| World rendering | performance time, read once per animation frame | the frame drawn at a wall time T shows performance time `now(T)` |
| Pack frames | the performance time of the render request | the bitmap arrives one transport round trip later (the latest is drawn) |
| Compositor | the animation frame | — |
| Canvas capture | capture timestamps (monotonic) | a frame per change, ≤ 30/s |
| Sound capture | audio track timestamps (rendered quanta) | — |
| WebM | both tracks' timestamps, relative to the recorder's start | — |

So picture and sound meet when the music renders an event at the wall time at which the stage first shows that event's
performance time. Expected deviations: audio render granularity (a few ms), presentation (≤ 16.7 ms at 60 fps) and
capture (≤ 33 ms at 30 fps) quantization, and the capture latencies of each path. A visual pack's own picture is
additionally one transport round trip late (its render time).

**A clock defect found and fixed.** In replay the playhead advanced only once per animation frame, and the music read
it when scheduling a cue: a cue scheduled between frames was late by the time since the last frame (0-16 ms at 60 fps),
and after a main-thread stall by the stall's length. Reproduced on purpose (a 150 ms stall just before each marker):
every marker +136 to +166 ms; after the fix (the playhead extrapolated between frames) −38 to +1 ms. It also removed a
systematic +10 ms in replays, which now match live mode (`qualification/results/sync/`).

## Measuring synchronisation (qualification only)

With `?qual=1` the qualification schedules markers at a performance time 300 ms ahead: the picture shows a full-frame
pure green flash (120 ms, and at least three presented frames) and the music plays a 40 ms linear chirp from 3 to 6 kHz,
both through the normal clocks above. `qualification/visual/media.js` (`markers`) finds the flash by its colour (the
chroma planes, so a world's own bright effects cannot be mistaken for it) and the chirp by normalised cross-correlation
with the same chirp (a matched filter, so musical notes are not mistaken for it; sample-accurate). The flash happened
after the previous captured frame and by the frame that shows it, so each marker's offset is reported as an interval,
`[chirp − flash frame, chirp − previous frame]`. A 12 kHz pilot tone at −40 dBFS measures sound continuity.

Criteria (ITU-R BT.1359, offset = sound − picture): detectable outside −45…+125 ms, acceptable within −90…+185 ms.
Qualification reports two separate verdicts: **functional** (a valid file, continuous sound, a steady stream, markers
paired) and **quality** (≥ 25 fps without gaps over 100 ms after start-up; every marker's interval within
acceptability and the median within detectability).

The first marker method (white flash, 2 kHz click found by band energy) could pair a marker with a musical note in the
2 kHz band or a world's own white flash; it was replaced (see `docs/QUALIFICATION.md`).

## Limits

- The recording is held in memory until it stops. Measured: the file grows about 17 MB a minute at a 746×512 stage,
  35-37 MB at 720p and 50-61 MB at 1080p, and the browser holds 1.5-1.7 times that while recording (3 minutes at 720p:
  a 110 MB file, +185 MB; at 1080p: 182 MB, +268 MB), so about 60 MB a minute at 720p and 90 MB at 1080p, against
  about 70 MB for the earlier default (the stage at 6.2 Mbit/s: a 132 MB file, +208 MB in three minutes).
  Streaming to disk (the File System Access API) is possible in Chromium but needs a file chosen by the user before
  each recording and cannot be exercised by the automated tests; it is not implemented. Use OBS for long sessions.
- Chromium-based browsers only (MediaRecorder with VP9/VP8 + Opus and canvas capture).
- A label that follows a moving object near the frame's edge can be cut by it (as on screen; the layout is the
  world's).
- On machines without a capable GPU the built-in worlds render slowly and recordings stutter (the player warns).
- **Record** is live (MediaRecorder). **Home Last night** is a sped-up replay of a scored highlight; Playwright is not
  involved. **`npm run film`** is the publish path: the same window, frame-exact, title-gated, always `--copy`;
  **`npm run film -- --vertical`** cuts a 9:16 clip of it (above). See [FIRST-RUN.md](FIRST-RUN.md#last-night).
