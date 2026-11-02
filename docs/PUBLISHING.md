# Publishing the extension

The steps the owner takes to publish Code Resonance on the Visual Studio Marketplace and on Open VSX. Everything up to
the upload is prepared in this repository; nothing has been published, and no account, token or upload was used to
prepare it.

## What is ready

- **The package.** `npm run package:vsix` writes `code-resonance-<version>.vsix` with Node alone
  ([scripts/package-vsix.js](../scripts/package-vsix.js)): the extension and, under `extension/runtime/`, the receiver
  it starts when none is running (3.22 MB, 214 files at 0.9.2). One package for every platform: the receiver is
  plain JavaScript run by VS Code's own runtime, so no `--target` builds are needed. It does not run in VS Code for the
  Web (no `browser` entry; capture needs a local extension host).
- **The manifest** ([extension/package.json](../extension/package.json)): publisher `zerobandwidth`, name
  `code-resonance` (extension id `zerobandwidth.code-resonance`), display name, description, `icon` (`icon.png`,
  128×128, cut from the Fractal Biosphere still), `galleryBanner` (dark), `preview: true` (the page shows a *Preview*
  badge; remove it for a stable release), `repository`, `homepage`, `bugs`, `license` (MIT), `keywords` (the tags),
  `categories`.
- **The VSIX manifest** (`extension.vsixmanifest`), written as vsce writes it: the identity (`Id` is the extension's
  name, `Publisher` apart), tags, categories, gallery flags `Public Preview`, the source, issues and homepage links,
  the banner, GitHub-flavoured Markdown, pricing *Free*, and the assets the gallery shows: README, changelog, licence
  and icon. `[Content_Types].xml` declares every file extension in the package.
- **The page.** [extension/README.md](../extension/README.md) becomes the Marketplace and Open VSX page: what it does,
  two stills, getting started in three steps, privacy in a paragraph, the receiver, agents, commands and settings. Its
  links and images are absolute; the images are `https://raw.githubusercontent.com/Nimdy/code-resonance/main/docs/media/…`,
  so they render only while the repository is public and those files stay on `main`. The changelog tab is
  [CHANGELOG.md](../CHANGELOG.md), copied in with its relative links made absolute.

`tests/package-vsix.test.js` checks all of the above (contents, manifest, content types, absolute links, the icon's
size) and starts the receiver from the unpacked package.

## Checked without an account (2026-10-30)

Anonymous public queries, not proof of ownership:

- **Visual Studio Marketplace:** the gallery has no public extension from a publisher named `zerobandwidth` (an
  `extensionquery` by publisher name returns 0; the same query for `ms-python` returns its extensions), and no
  extension called *Code Resonance*. Whether a publisher with the id `zerobandwidth` exists, and whose it is, cannot be
  seen without signing in: **not verified**.
- **Open VSX:** the namespace `zerobandwidth` does not exist (`GET https://open-vsx.org/api/zerobandwidth` answers 404
  *Namespace not found*), so it is free to create.

## Before each publication

1. **Version.** Bump `version` in [package.json](../package.json) and in [extension/package.json](../extension/package.json)
   together: the receiver the VSIX carries reports the first, the extension the second, and a test requires them to be
   equal. Turn the changelog's `## Unreleased` into the version's heading.
2. **Check.** `npm test` and `npm run check`. For the extension in a real VS Code with no receiver running (isolated
   profile, a free port): `cd qualification && npm ci`, then `xvfb-run -a node vscode/bundled.js` on Linux.
3. **Build.** `npm run package:vsix`. Publish exactly this file; do not repackage it with `vsce package`, which would
   take its file list from the folder instead (the runtime would be missing).
4. **Try it** in an isolated profile, never your everyday one:
   `code --user-data-dir /tmp/cr-try --extensions-dir /tmp/cr-try/ext --install-extension code-resonance-<version>.vsix`,
   then open a project with the same two options.

## Visual Studio Marketplace

1. **An Azure DevOps organization** for your Microsoft account (<https://dev.azure.com>); it only issues the token.
2. **A Personal Access Token:** Azure DevOps › User settings › Personal access tokens › New token. Organization: *All
   accessible organizations*. Scopes: *Custom defined* › **Marketplace › Manage**. Keep it out of the repository.
3. **The publisher** at <https://marketplace.visualstudio.com/manage/createpublisher>, with the ID exactly
   `zerobandwidth`, the `publisher` in extension/package.json. A publisher ID cannot be changed later. If it is taken by
   someone else, choose another ID and change `publisher` before the first upload: that also changes the extension id
   (`<publisher>.code-resonance`), the settings link the Control Center opens (`vscode://<publisher>.code-resonance/settings`,
   read from extension/package.json), the outbox folder in VS Code's global storage, the id the qualification suites
   look up, and existing installations would not update into it.
4. **vsce**, installed globally, outside this repository (the product stays dependency-free):
   `npm install -g @vscode/vsce`.
5. **Sign in:** `vsce login zerobandwidth` and paste the token (or set `VSCE_PAT` for one command).
6. **Publish the built file:** `vsce publish --packagePath code-resonance-<version>.vsix`.
7. **Check** <https://marketplace.visualstudio.com/items?itemName=zerobandwidth.code-resonance> once the Marketplace
   has verified it (a few minutes), then install it from VS Code's Extensions view in an isolated profile.

## Open VSX

Open VSX serves VSCodium, Cursor, Gitpod and other editors built on VS Code's open-source code.

1. **An Eclipse account** (<https://accounts.eclipse.org>) with your GitHub user name in its profile.
2. **Sign in to <https://open-vsx.org> with GitHub**, link the Eclipse account in your profile there and sign the
   **Open VSX Publisher Agreement** it shows.
3. **An access token:** open-vsx.org › your profile › Access Tokens › Generate New Token.
4. **The ovsx tool**, outside this repository: `npm install -g ovsx` (or prefix the commands with `npx`).
5. **The namespace, once:** `ovsx create-namespace zerobandwidth -p <token>`. Extensions in a namespace nobody has
   claimed are shown as unverified; Open VSX's documentation on namespace access explains how to claim it.
6. **Publish the built file:** `ovsx publish code-resonance-<version>.vsix -p <token>`.
7. **Check** <https://open-vsx.org/extension/zerobandwidth/code-resonance>.

## After the first publication

- Remove the *not yet* from the README's quick start and from [FIRST-RUN.md](FIRST-RUN.md#with-the-extension-alone),
  and update [OPERATIONS.md](OPERATIONS.md#status).
- Attach the same VSIX to the GitHub Release of that version, as for earlier releases.

## Not verified

- **No upload has been made.** Neither the Marketplace nor Open VSX has validated this package; its manifest follows
  vsce's template (checked by the tests), and VS Code's own CLI installs it (the qualification).
- **The publisher id** `zerobandwidth` on the Marketplace (above).
- How the Marketplace and Open VSX render the README (the raw image URLs answer 200 publicly today).
- The receiver the extension starts has been qualified on Linux (VS Code 1.143.1) only, not on Windows or macOS.
