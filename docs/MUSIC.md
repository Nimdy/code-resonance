# Music

Every project has a musical identity drawn from its seed: key, mode, chord progressions, a motif (rhythm, contour
and answer), a tempo per style and a swing. It never changes. The **score** decides how that identity becomes music
over time, and the **performance profile** shapes how the score is played. Both are pure functions of the project, the
recorded performance and the settings. Live playback, replay, the WAV export and films all run the same code
(`public/score.js` for what is played, `public/music.js` for how it sounds) on the shared performance clock.

## Two scores, chosen per identity

| Score | Who plays it | What it is |
|---|---|---|
| **Classic (v2)** | Every identity created before Phase 11, until it is deliberately upgraded | 8-bar sections chosen from activity, layers unlocked by chapters. Frozen: `tests/score-v3.test.js` pins its exact output |
| **Composed (v3)** | New identities (recipe generator v4: `genome.music.score = 3`) and upgraded ones | Long-form composition, described below |

An identity moves to the composed score only when someone presses **Use the composed score** in the Music Studio. That
is a recipe `tune` of `music.score`, and it can be undone. Old films keep their soundtrack: their recipes carry no
`music.score`, so they play v2. Switching versions while music is playing swaps the audio bus on the same context with
a crossfade, so a running recording continues.

## What the composed score does

- **Form.** Music moves in arcs of twelve 8-bar passages. Each arc is a seeded sequence of sections:
  - **statement**: the motif stated and answered;
  - **development**: the motif sequenced, fragmented and inverted, plus a second idea of its own (the motif's rhythm
    reshaped and its contour mirrored), with the harmonic rhythm quickening toward the end;
  - **interlude**: sparse, a held tonic pedal, atmosphere and fragments on a soft bell;
  - **return**: the motif recognisably back, now with a countermelody;
  - **release**: thinning out, slowing harmony, a cadence home.

  Five forms (drift, song, arch, variations, journey) sit between familiar and exploratory. The Evolution control
  chooses among them per arc. Roles change only at passage boundaries.
- **Phrases.** Four-bar periods built from the motif: a call, a tail or a rest, an answer, then a cadence. The first
  phrase ends open on a chord tone that asks for more. The second closes, on the tonic when the music returns or
  releases, through an appoggiatura. Strong beats land on chord tones and held notes sustain to the next onset.
- **Harmony.** The identity's own progressions, voice-led: each chord takes the voicing nearest the one before it,
  around middle C. Colour stays inside the key: added ninths on tonic and subdominant, diatonic sevenths elsewhere,
  and a suspended fourth on a cadential dominant that resolves at mid-bar. The bass walks to inversions or holds a
  pedal, with approach notes into chord changes.
- **Arrangement roles.** Foundation (bass), harmony (pads), melody, countermelody (guide tones moving by step, mostly
  where the melody rests), rhythmic support (arpeggios and ostinati), percussion, and atmosphere. Atmosphere means a
  high shimmer over chord changes, glints of glass, harp or breath, and transition gestures: a riser into a denser
  section, a wash at a return, a swell at a release.

  Chapters (long-term progress) make roles available. The section decides which of them play, and they enter and
  leave at passage boundaries.
- **Dynamics.** Each section has a level curve: developments crescendo, releases fade, interludes sit low. Phrases
  arch within it. Measured on the recorded lumen session, the loudness range went from 1.6–3.7 LU (v2, a uniform
  level) to 5.5–12 LU (v3), at about −22 to −24 LUFS integrated, with peaks at or below −10 dBFS.
- **Engineering in the music.** Sustained trouble (failing tests or builds) takes the next passage over as a tension
  passage, and a resolving passage follows. A short failure is caught if it falls in the two bars before a boundary.
  A verified milestone (`milestone.*`, a passing validation; never a failure) lifts the next passage. Recorded events
  still sound as the same accent figures, harmonised with the current chord.

## The four styles

| Style | Character in the composed score |
|---|---|
| **Ambient** | No drums. A high, breathy flute melody over warm pads, harp-like arpeggios and glass glints, tonic pedals in interludes, a long dark room |
| **Pulse** | Drums that change with the section (syncopated in developments, fills into returns) and drop out in releases and interludes. Plucked saw arpeggios with accents, a saturated bass |
| **Cinematic** | Strings: an ostinato that builds through developments, a solo line with delayed vibrato. Taiko only at section starts and in fills. Swells, washes and the widest dynamics |
| **Chip** | Band-limited 50/25/12.5 % pulse waves, fast three-note arpeggios across the stereo field, echo canons in developments, four on the floor in developments and a pickup in returns, an octave-jumping bass |

The low end was rebalanced by the arrangement, not by EQ. Pads sit around middle C and the bass an octave higher than
in v2, and saturation lets the bass speak on small speakers. Upper detail comes from parts in a high register: in
Ambient, the energy below 120 Hz fell by 1.6 dB while the share above 2 kHz rose to −17.7 dB (v2: −18.6). There is no
global treble boost.

## The performance profile (Music Studio)

All controls run from 0 to 1, with .5 as composed. Each one changes what is played or how it sounds:

| Control | What it changes |
|---|---|
| Mood | How much is going on: calm keeps the arrangement sparse, intense adds voices and motion. Loudness is held by the trims |
| Evolution | Which forms the arcs take, how often a statement is varied, and how often the second idea appears |
| Melody | How much the melody leads: rests and tails, fills, its level |
| Rhythm | Arpeggio rate and patterns, percussion presence (Ambient gets a shaker above .55), bass patterns |
| Atmosphere | The shimmer, the glints and how present they are, above all in interludes and releases |
| Harmony | Sevenths, ninths, suspensions, the walking bass, the quickened developments |
| Dynamics | How far sections swell and fade, and how much phrases arch |
| Space | The room's size and level, its pre-delay, the echo's level and feedback |

**Balance** gives a level (0 to 150 %) and a mute for each voice group the style can actually sound: pads, bass,
melody, countermelody, arpeggio, percussion and atmosphere. The Music Studio hides groups the style would never play.

Changes are heard from the next bar. A preview stays in its window until Apply (to the project, or to the global
defaults). Music presets hold style, tempo, texture, the profile and the balance, never the key, mode or motif. A
preset is reusable across projects, and four curated starting points are built in. Values outside a control's range
are refused by the receiver with the field named, so nothing invalid is stored.

## What the visuals hear

`public/worlds/musical.js` gives every world, the digital life and the Artist Studio's layers the score's
**expression** at each moment: section role, form position, phrase position, beat and bar pulses, energy, harmonic
tension, density, melodic and rhythmic activity, dynamics, transition and onset, and release. It reads the recorded
frames, never the audio device, so a muted or unplugged machine shows the same performance. See `docs/LIFE.md`
(ecology 2) and `docs/ARTIST-STUDIO.md` (signals).

## Checking it

- `node --test tests/score.test.js tests/score-v3.test.js tests/audio-engine.test.js tests/musical.test.js`
- `node qualification/audio/score-versions.js --data <dataset> --project <id> [--seconds 180]` renders a recorded
  session through both scores and all four styles with the real Web Audio engine. It writes the WAVs for listening
  and reports loudness, loudness range, true peak, low and high share and stereo correlation.
