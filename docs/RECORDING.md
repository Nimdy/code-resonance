# Recording: how it works, what it guarantees, how it is measured

## Using it

**Record** (in the top bar, on the Stage, or in **Record & Broadcast**) records what the stage shows (the world and its
labels, for every world and every kind of visual pack) together with the music, to a WebM file (VP9 video, Opus sound).
One window records at a time.

**Where it is written** (Record & Broadcast, a choice of this browser, kept in its storage):

- *Download at the end* (the default, as before): the browser holds the whole file in memory until you stop, then
  downloads it. A crash or a closed tab loses it. For up to about half an hour (see *Limits*).
- *File on disk* (recommended for long sessions): you choose the file in the browser's Save dialog when you
  press Record, and the recording is written to disk as it is recorded. Memory stays flat, the length is bounded by the
  disk, a crash or a closed tab keeps what was written, and the saved file is seekable with its duration. See
  [Recording to a file on disk](#recording-to-a-file-on-disk).

**Recording profile** (Record & Broadcast, beside where it is written under the monitor; the global default in
Settings): *720p* (1280×720, the default), *1080p* (1920×1080), *Vertical* (1080×1920, 9:16: see [Vertical
clips](#vertical-clips-916)) or *Stage size*. At 720p or 1080p the world renders at exactly that size with a 16:9 camera
(the living worlds, visual packs and the Construct), and the stage shows the same picture letterboxed while you record:
what you see is what is recorded, nothing is stretched, cut or bordered in the file. Monolith, the 2D world, keeps the
stage's shape and is fitted into the frame with black bars (at Vertical it is drawn upright at 1080×1920 too). Labels
scale with the output, so 720p and 1080p have the same composition. *Stage size* records the stage as it is on screen
(any aspect ratio). Video bitrate: 5 Mbit/s at 720p, 8 Mbit/s at 1080p, in proportion for the stage size. Adaptive
quality may lower the world's internal resolution while frames are slow; the file keeps the chosen dimensions.

720p is the default because it holds 30 frames per second on modest GPUs: on the AMD integrated GPU used for testing
(measured with the worlds of PR #6, before the flagship worlds), every world recorded at 30 fps at 720p, while at
1080p the built-in worlds (rendered on the player's main thread) drew about 31 frames a second and the file kept 26-28
(visual packs, rendered in their worker, still recorded at 30). If a
recording cannot keep up (fewer than 28 frames drawn per second for ten seconds), the player says so once and suggests
720p or a lower Quality. Kept in memory, a recording grows the browser's memory until you stop (see *Limits*): for
sessions longer than about half an hour, record to a file on disk, or with OBS.

If the sound stops reaching the recording (an audio device disconnected or stalled), the browser's recorder would stall
the whole file, so the player finishes and saves the recording at that moment and says why.

## Recording to a file on disk

**Using it.** Choose *File on disk* under *Where it is written*. Record then opens the browser's Save dialog
(the name is `code-resonance-<project>-<time>.webm`; the browser remembers the folder) and starts once you have chosen
the file; cancelling records nothing. While it records, the *Data* readout is *On disk*: the bytes written so far, as the
writer confirms them, beside the elapsed time; the *File* line names your file. When you stop, the line under Record says
*Saving … %* while the recording is copied into your file, then *Saved … in the file you chose*. The top bar and the
Stage record the same way (the dialog opens there too).

**How it works, and why this way.** The browser's recorder delivers a chunk of the file every second. A worker
(`public/recording-worker.js`) writes each chunk at once, in place, into a working file in the browser's own file
storage for this page (the *origin private file system*), through a synchronous access handle, and drops it: nothing of
the recording is kept in the page's memory. Writing straight into the file you chose is not crash-safe in Chromium: a
`FileSystemWritableFileStream` writes to a temporary copy (`<name>.crswap`) that becomes your file only when the stream is
closed, and Chromium deletes that copy when the page crashes or closes first. Measured in the Chromium the tests use
(151), on files of the private storage: 5 MB written through a writable stream, then the renderer crashed: the
temporary copy was gone and the file had 0 bytes; 4 MB written through a synchronous access handle, then the renderer
crashed: all 4 MB kept. (A file the user picks gets the same writer, its temporary copy beside it: not measured, since
headless Chromium shows no Save dialog.) That handle is the only browser API that writes into a file in place, and it
exists only for the private file storage, in a worker. So the recording is written there, and when it stops the same
worker copies it into your file in large pieces, off the page's main thread (which keeps drawing the world), made
seekable on the way (`public/webm.js`); the working file is then deleted. (If a worker may not write the file you
chose, the page copies it itself.) The cost: at the end the recording is on disk twice until the copy finishes, and the
working file is on the drive of the browser's profile. Nothing goes through the receiver (it serves two more static
files, the worker and `webm.js`); nothing is uploaded; an unpaired browser records to disk as well.

**A crash or a closed tab.** The working file keeps every chunk written until then: what the encoder had not yet
delivered (the last second or two) is lost. Any window of the browser opened afterwards offers it in Record & Broadcast
(*Interrupted recording kept*: **Save to a file…** or **Discard**), and the other pages say so once. Saving indexes it up
to its last complete block and makes it seekable. While a window records or saves a working file it holds that file's
own Web Lock, so no other window offers it; a crash releases the lock at once. The file you chose is written only by
the copy, so it holds nothing of an interrupted recording (the browser may have created it empty): save the
interrupted recording over it or elsewhere.

**Seekable.** The recorder writes a live WebM: the Segment and its Clusters have no size, the Info has no duration and
there are no Cues, so players show no length and browsers cannot seek it. While it is written the worker indexes it
(element headers only), and the copy writes the Segment's size, a SeekHead, the duration, every Cluster's size and Cues
on each Cluster's first video keyframe; the picture and sound are copied unchanged. A recording kept in memory is
saved as the browser wrote it; `ffmpeg -i in.webm -c copy out.webm` makes one seekable (ffmpeg is not part of the
product).

**Bounds.** The disk space the browser lets the page use (Chromium allows a site up to about 60 % of the disk; the card
shows what is free for it). A chunk that cannot be written (the disk or that allowance full) finishes the recording and
saves what was written; if the copy into your file fails, the recording stays in the browser as an interrupted
recording to save again. In a private (incognito) window Chromium keeps this storage in memory, so there the length is
not bounded by disk (not measured here).

**Where it is not offered.** Browsers without the File System Access API (Firefox, Safari; Brave turns it off by
default) and pages opened on a network address rather than `localhost` or `127.0.0.1` (the browser allows file writing
only on a secure page): the choice is disabled with the reason, and recordings are kept in memory.

**Measured** (`qualification/visual/record-disk.qual.js`, headless Chromium 151 with SwiftShader, the lean driver, three
minutes per run; `qualification/results/memory/memory-record-disk.json`). SwiftShader draws few frames, so the files
grow slower than on a GPU (16-17 MB a minute at 720p, 11-12 MB at 1080×1920); what matters is where the growth goes.

| 3 minutes | file | browser process | renderer | GPU process | all processes | saved after Stop |
|---|---|---|---|---|---|---|
| 720p, in memory | +45.9 MB | **+46 MB** | +31 MB | +8 MB | +85 MB | download |
| 720p, to disk | +48.1 MB | **+0 MB** (104-115) | +29 MB | +6 MB | +36 MB | 0.4 s, seekable (181.1 s) |
| 1080×1920, in memory | +34.7 MB | **+37 MB** | +34 MB | +5 MB | +77 MB | download |
| 1080×1920, to disk | +32.9 MB | **+3 MB** (104-112) | +36 MB | +7 MB | +46 MB | 0.5 s, seekable (181.7 s) |

Kept in memory, the recording's bytes accumulate in the browser process, one for one; written to disk they do not, and
the working file on disk grew by exactly what the recorder delivered at every sample. The renderer grew about 30 MB in
every run, whichever the destination (the world, not the recording); the JS heap stayed between 9 and 16 MB. A
recording killed at 61.9 s (the renderer crashed) left 16,636,802 bytes on disk, everything written: the working file as
it was decodes to 60.9 s, and saved through *Interrupted recording kept* it is a seekable 60.9 s file with picture and
sound that decodes without an error. A tab closed at 27.3 s left 27.0 s, saved the same way. A recording of 1,035 MB (a
64.5-minute live WebM made from a real one) was indexed and copied into the chosen file through the interface in 5.1 s
(about 200 MB/s on this machine's disk), and seeks to its middle.

**Not verified:** headed Chrome or Edge on Windows with the real Save dialog (the tests answer the dialog with a file of
the private storage: the same `FileSystemFileHandle` and `createWritable()`, but not a file the user picked, so the
browser's check of a downloaded file on close is not exercised, nor whether the worker may write such a file: if not, the
page copies it, a path checked with stand-ins only), live recordings longer than three minutes (the 1 GB file was made
from a real recording, not recorded for an hour), a GPU's frame rate (SwiftShader only), a disk that fills up (the
failure paths are checked with stand-ins in `tests/record-to-disk.test.js`, not on a real disk), and private windows.

## Vertical clips (9:16)

A coding night, posted: a 1080×1920 clip of the project's best moment with its music, for Instagram Reels and YouTube
Shorts. Two ways to make one:

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
  browser saves WebM (VP9 and Opus), which YouTube takes; Instagram wants MP4, so use the film for Reels or
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

**Not verified:** uploading to Instagram or YouTube (nothing here talks to them), and how each platform's
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

- *Download at the end* (the default) holds the recording in memory until it stops. Measured: the file grows about 17 MB
  a minute at a 746×512 stage, 35-37 MB at 720p and 50-61 MB at 1080p, and the browser holds 1.5-1.7 times that while
  recording (3 minutes at 720p: a 110 MB file, +185 MB; at 1080p: 182 MB, +268 MB), so about 60 MB a minute at 720p and
  90 MB at 1080p, against about 70 MB for the earlier default (the stage at 6.2 Mbit/s: a 132 MB file, +208 MB in three
  minutes). For long sessions record to a file on disk (above), whose length is bounded by disk, or use OBS.
- Chromium-based browsers only (MediaRecorder with VP9/VP8 + Opus and canvas capture).
- A label that follows a moving object near the frame's edge can be cut by it (as on screen; the layout is the
  world's).
- On machines without a capable GPU the built-in worlds render slowly and recordings stutter (the player warns).
- **Record** is live (MediaRecorder). **Home Last night** is a sped-up replay of a scored highlight; Playwright is not
  involved. **`npm run film`** is the publish path: the same window, frame-exact, title-gated, always `--copy`;
  **`npm run film -- --vertical`** cuts a 9:16 clip of it (above). See [FIRST-RUN.md](FIRST-RUN.md#last-night).
