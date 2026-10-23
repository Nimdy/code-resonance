# Code Resonance — VS Code extension

Start the Code Resonance receiver (`npm start` in the Code Resonance source) on the **same OS or remote host as this extension host** (for example inside WSL for a WSL workspace). In a trusted workspace, click the **CR** status-bar item or run **Code Resonance: Start Code Performance**, and accept local capture. The status-bar menu stops capture and opens the Stage or the OBS view. Capture resumes after a VS Code restart until you stop it.

What leaves the editor: bounded source snapshots for analysis (unless `resonance.captureDocumentContents` is off), per-second edit counts (never typed text), file operations, diagnostics counts, task and terminal command categories with exit codes (command text only if `resonance.captureTerminalCommands` is on), Git commits, and the folder name for the local project list (`resonance.shareProjectName`). Everything goes only to the loopback receiver; the outbox keeps events on disk while the receiver is offline.

This extension does not execute code, infer hidden model thoughts, send telemetry, or depend on Signal/3.
