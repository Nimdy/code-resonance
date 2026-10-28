# Third-party notices

Code Resonance is licensed under the [MIT License](LICENSE). It includes the third-party software below, which keeps
its own licence.

## Included in this repository

| Component | Version | Licence | File | Licence text |
|---|---|---|---|---|
| three.js | r170 | MIT | `public/vendor/three.module.min.js` (the player's 3D renderer) | [public/vendor/THREE-LICENSE.txt](public/vendor/THREE-LICENSE.txt) |
| TypeScript | 5.8.3 | Apache-2.0 | `vendor/typescript.js` (the compiler the receiver uses to read TypeScript and JavaScript structure, offline) | [vendor/TYPESCRIPT-LICENSE.txt](vendor/TYPESCRIPT-LICENSE.txt) |

Both files keep their original copyright headers. TypeScript remains under the Apache License 2.0: the MIT License of
this project does not apply to it.

The VS Code extension (`code-resonance-<version>.vsix`) contains only this project's own code and its licence.

## Installed separately, not distributed

The qualification harness and `npm run film` use tools that `cd qualification && npm ci` downloads. They are not part
of this repository, the application or the extension:

| Package | Licence | Used for |
|---|---|---|
| playwright-core | Apache-2.0 | driving Chromium in the qualification suites and films |
| @vscode/test-electron | MIT | running a real VS Code in the extension qualification |
| three | MIT | the npm release of three.js that the vendored copy matches |
| ffmpeg-static | GPL-3.0-or-later (it downloads an FFmpeg binary, also GPL) | encoding films and checking recordings, run as a separate program |

## Visual packs

The example packs in `packs/examples/` declare their own licences in their `pack.json` (and a `LICENSE` file where
there is one). A pack you install keeps the licence its author gave it.
