# OBS Studio

## Set up

1. Start the receiver and open the player; choose the project, world and look you want.
2. **OBS VIEW ↗** opens the overlay URL, for example
   `http://127.0.0.1:4174/?overlay=1&sound=1&project=<id>&world=living&style=ambient`.
3. In OBS: **Sources → + → Browser**. URL: the overlay URL. Width 1920, height 1080, FPS 30 or 60 (custom frame rate).
   Tick **Control audio via OBS** (the music then appears in OBS's mixer and in recordings and streams).
4. The overlay shows only the stage: labels are in *stream* mode (no controls, no project selector, nothing private).
   `sound=1` starts the music without a click (OBS's browser allows autoplay).

## Acceptance procedure (reproducible)

Run on the machine and OBS version you will stream with; record the answers.

| # | Step | Accept when |
|---|---|---|
| 1 | Add the Browser Source as above; wait 20 s | the world renders and moves; no controls are visible |
| 2 | Watch OBS's audio mixer | the source's meter moves with the music |
| 3 | Make an edit and save in VS Code | about 10 s later the stage and the music react |
| 4 | **Start Recording** in OBS for 60 s, stop, play the file | picture and music present, in step, no stutter |
| 5 | Switch the world in the player's World DNA (normal browser tab), reload the source | the overlay shows the new world |
| 6 | Choose an approved visual pack, reload the source | it renders in OBS (a pack with code needs its approval first, in the normal player) |
| 7 | Look at every visible label for 2 minutes | no file names, paths, folder name, prompts or commands |
| 8 | Leave it running 30 minutes | still moving and sounding; OBS's stats show no growing frame drops |

## What has been verified, and where

- **Chromium (not OBS):** the overlay, the music without a click, labels in stream mode, and privacy of every label, in
  headless Chromium (`qualification/browser`, `qualification/visual`). Chromium results are not OBS results.
- **OBS Studio itself:** `qualification/obs/obs.qual.js` runs OBS (official PPA build) in a disposable GitHub Actions
  virtual machine under Xvfb with software OpenGL: it adds the overlay as a Browser Source through obs-websocket, checks
  the source renders and moves (source screenshots), that the music reaches OBS's mixer (audio meters), and records with
  OBS and measures the file. It never installs anything on a working machine. Result: 6/6 with OBS 32.2.0 (overlay
  rendering and moving, music in OBS's mixer, an OBS recording with H.264 video and AAC sound); details in
  [QUALIFICATION.md](QUALIFICATION.md). OBS on Windows and macOS, with a GPU, has not been run.
- **On a machine without a GPU**, OBS's default browser hardware acceleration leaves the page without WebGL and the
  player shows the Construct instead of the living world: turn off *Settings → Advanced → Browser Source Hardware
  Acceleration* there.
