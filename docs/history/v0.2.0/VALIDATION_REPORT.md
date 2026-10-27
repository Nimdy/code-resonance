# Code Resonance v0.2.0 — packaging validation report

Distribution: Original `code-resonance-0.2.0-source.zip` carried forward with its 37 original source files. Of those, 36 remain **byte-identical**. Only `README.md` was expanded to explain Windows/Linux installation and the single-ZIP distribution. The new root and extension npm lockfiles and validation/manifest documents are packaging additions. No application source, test source, audio logic, or visual logic was rewritten.

Original source ZIP SHA-256: `50220f84fcbccfd79dda7e1bc6d39119f509c1f6767fc1ecbb4b549bb9c64681`

## Confirmed automated checks

- `npm ci --offline --ignore-scripts --no-audit --no-fund` (root and `extension/`): **PASS**, no third-party runtime packages installed.
- `npm run check`: **PASS**, syntax checks over receiver, semantic sorter, reducer, worker, extension, outbox, player, music, score, and performance SDK.
- `npm test`: **PASS**: 20 tests, 0 failed, 0 skipped, 0 cancelled; Node's built-in `node --test` runner, seven `tests/*.test.js` files.
- `npm run package:vsix`: **PASS**, extension built successfully.
- `unzip -t code-resonance-0.2.0.vsix`: **PASS**, generated VSIX valid. Build artifact excluded from the source ZIP intentionally; generate it from included source with the command above.
- Local smoke: **PASS**, receiver health endpoint and Stage HTML served; synthetic demo ingested 20 events, produced 20 derived musical control frames, and appeared in projects API. Receiver used a temporary data directory and a random local port, then stopped.

Detailed output: `VALIDATION_OUTPUT.txt` and `SMOKE_OUTPUT.txt`.

Environment: Linux container, Node.js v22.16.0, npm 10.9.2, 2026-10-23 16:31 UTC.

## Not tested / qualification still needed

- A real installed VS Code extension host, including Windows VS Code, WSL2, SSH, third-party agent integrations, and sustained editor latency.
- User-facing browser playback, actual Web Audio output, graphics/Canvas2D interactions, OBS embedding/audio capture, WebM recording, and true recording export; HTTP asset availability is **not** proof of these behaviors.
- Native Windows runtime/build execution; instructions supplied but this environment was Linux.
- This version uses **Canvas2D** visual rendering and Web Audio, not WebGPU. It contains ordinary JavaScript, not an application TypeScript build (there are no `tsconfig.json` files to include). `vendor/typescript.js` is the actual parser dependency and is retained with its license.
- Multi-month replay, universal interception of private AI reasoning, and independent semantics for languages other than JS/TS are not implemented features of this source version.

## Packaging/exclusions

Original implementation and seven test files are preserved. `MANIFEST.sha256` lists the SHA-256 of every other file in this package; its own hash cannot be embedded within itself without a recursive-hash contradiction. `FILE_TREE.txt` lists **all** packaged files, including the manifest. The SHA-256 of the final archive is reported separately alongside the delivery link. No `.git/`, `node_modules/`, cache, secret files, generated VSIX, log cache, capture recordings, or unnecessary binaries are included.
