# Code Resonance — VS Code extension

Start a local Code Resonance receiver with `npm start` in the project source package on the **same OS/remote extension host** as this extension. In a trusted workspace, choose **Code Resonance: Start Code Performance** and explicitly accept local source capture. End recording with **Code Resonance: Stop Code Performance**. The status-bar item opens the standalone Stage.

Configurable: receiver port, baseline limit, source content capture, hidden file indexing, terminal command text (off by default), and opt-in prompt text (off by default). Source files and editing deltas may contain sensitive information, even if their paths are not known secret filenames. The extension's outbox remains on local disk during receiver outages.

This extension does not execute code, infer hidden model thoughts, send telemetry, or depend on Signal/3.
