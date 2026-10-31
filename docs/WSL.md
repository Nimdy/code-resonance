# Windows with WSL2

The receiver stays on loopback (`127.0.0.1`) and keeps its token: nothing here needs `RESONANCE_ALLOW_REMOTE=1`, a
`0.0.0.0` bind, a firewall rule or turning authentication off. Do not do any of those for convenience.

## Where things run

| Your workspace | Extension host | The receiver runs | Open the player from |
|---|---|---|---|
| a WSL folder (VS Code "WSL: …") | inside WSL | inside WSL: the extension starts it there, or `npm start` in WSL | Windows: `http://localhost:4174/` |
| a Windows folder | Windows | Windows: the extension starts it there, or `npm start` in PowerShell | Windows: `http://127.0.0.1:4174/` |

The extension and the receiver must be on the same side: the extension reads the receiver's token from the home
directory of the side it runs on (`~/.code-resonance/receiver-auth.json`). Agent hooks follow the same rule.

**The receiver the extension carries** starts in the *workspace* extension host, the one that runs the extension
(`extensionKind: workspace`): for a WSL window that is the VS Code Server inside WSL, so the receiver is a Linux process
run by the server's own `node`, with its data in WSL's `~/.code-resonance` and bound to WSL's `127.0.0.1`. Install the
extension in the WSL window (*Extensions* lists it under *WSL*); a copy installed only on the Windows side does not run
for a WSL folder. **CR › Open Stage** opens the Windows browser on it through VS Code, which reaches it like
`http://localhost:4174/` below. The same holds for SSH and container windows: the receiver runs on that host, and VS
Code forwards the port when it opens the link.

One receiver per port per computer side: a Windows window and a WSL window that both start one need different ports
(`resonance.receiverPort`) in NAT mode, because Windows' `localhost:<port>` already forwards to WSL's (and in mirrored
mode the two share the port). A Windows window that finds WSL's receiver on its port does not start a second one: it
cannot prove the token (another data directory) and says the port is used by another receiver. Not tested on a Windows
desktop (below).

## Reaching a WSL receiver from Windows

WSL2 makes a Linux service on `127.0.0.1` reachable from Windows as `localhost`:

- **NAT mode** (the default): `localhostForwarding` (on unless `.wslconfig` sets `localhostForwarding=false`)
  forwards Windows `localhost:<port>` to WSL's loopback.
- **Mirrored mode** (`networkingMode=mirrored` in `.wslconfig`): Windows and WSL share loopback.

Check, from Windows PowerShell, with the receiver running in WSL:

```powershell
Invoke-WebRequest http://localhost:4174/health | Select-Object -ExpandProperty Content
```

A JSON answer with `"ok":true` means the player at `http://localhost:4174/` works too, and so does OBS on Windows with
the overlay URL. `npm run doctor` inside WSL prints the port and the mode it infers.

If it fails:

1. In WSL: `npm run doctor` (is the receiver running? on which port?).
2. In `%UserProfile%\.wslconfig`, make sure `localhostForwarding` is not `false` (NAT mode), then `wsl --shutdown`
   and start WSL again.
3. Some VPN and security products block the forwarding; mirrored mode usually works with them.

## What has been verified

On WSL2 (this project's development machine): the receiver, the extension in a real VS Code extension host (Xvfb), the
receiver the extension starts itself (a Linux VS Code under Xvfb, not a Remote-WSL window), the player in headless
Chromium, all over loopback. A Remote-WSL window (Windows VS Code, WSL extension host) starting its receiver has not
been run. The Windows side of the forwarding (a Windows browser or OBS on Windows
reaching a WSL receiver) has **not** been tested automatically: the development environment has no Windows interop, and
tests are not run on the owner's Windows desktop without permission. The check above is the reproducible procedure.
Native Windows (receiver, pack CLI, unit and integration tests, VSIX) runs in CI on GitHub's Windows runners; see
[QUALIFICATION.md](QUALIFICATION.md).
