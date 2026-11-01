# AI agents: which tools Code Resonance can observe

AI coding agents appear in a project's world as a **CAST**: named presences with a stable seat, colour, signal shape
and voice. An agent joins only through an **observe-only adapter**. This is a small program that the agent's own hook
mechanism runs, and it forwards only what the performance needs. A tool without an adapter can report through
`node scripts/event.js --provider <name>`. Its file writes are still seen by VS Code capture, but they are attributed
`unknown`.

**Checked on 2026-10-30.** Every fact below comes from the tool's official documentation, fetched that day; the
sources are linked in the tables. Each adapter was built from that documentation and tested only against the payload
shapes it documents. **No real session of any of these tools was run to qualify them.** Grok Build 1.0.70 is
installed on the development machine, but it was not run.

## What every adapter does and never does

- **Reads** the hook's documented JSON from stdin. It forwards session start and end, tool names, the
  project-relative paths that the documented arguments name (filtered as the VS Code extension filters them), a
  command *category* (test, build, lint, …), and a prompt's or reply's length and fingerprint.
- **Never forwards** prompt text (unless `RESONANCE_CAPTURE_PROMPT_TEXT=1`), reply text, command lines, tool output,
  edit strings, patch hunks or file contents. Payloads that are not in the documented shape become no events.
- **Never prints** to stdout and **always exits 0**. Installers register only events on which empty output and exit 0
  cannot deny, block or rewrite anything. An event that can deny is never installed, even if the adapter would ignore
  it (for example `PreToolUse`, `BeforeTool` and `permissionRequest`).
- **Sends the token** only to a receiver that proves it holds it (`receiver/proof.js`). Otherwise it spools events in
  `spool/` until the next invocation.
- **Is installed per project.** `npm run hooks:<tool> -- <project>` (add `--print` to see the result first) or
  Connections → *More agents* in the Control Center. The Control Center shows the exact change and writes only if the
  file is still the one shown. Installers add and remove only their own entries. They refuse the home directory,
  where hook files apply to every workspace. The Control Center also refuses links on every folder of the path.

## Tools with an adapter

| Tool | Documentation | Project file written | Events installed | Files | Shell | Never installed |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | [hooks](https://code.claude.com/docs/en/hooks) | `.claude/settings.local.json` | SessionStart/End, UserPromptSubmit, Pre/PostToolUse, PostToolUseFailure, Subagent*, Stop | Edit/Write/MultiEdit/NotebookEdit, reads | category + exit code when given | — |
| Cursor | [hooks](https://cursor.com/docs/agent/hooks) | `.cursor/hooks.json` | sessionStart/End, afterFileEdit, afterShellExecution, subagentStop, stop | `afterFileEdit.file_path` | category, exit code when given | `subagentStart` and every `before*` hook |
| Codex | [hooks](https://developers.openai.com/codex/hooks) | `.codex/hooks.json` | SessionStart/End, UserPromptSubmit, PostToolUse, Subagent*, Stop | patch headers only | category + exit code | `PreToolUse`, `PermissionRequest` |
| Gemini CLI | [reference](https://geminicli.com/docs/hooks/reference/), [tools](https://geminicli.com/docs/reference/tools/) | `.gemini/settings.json` | SessionStart, SessionEnd, BeforeAgent, AfterAgent, AfterTool (`write_file`, `replace`, `read_file`, `run_shell_command`) | `tool_input.file_path` | category; failed only when `tool_response.error` is set | `BeforeTool`, `BeforeModel`, `BeforeToolSelection` |
| Qwen Code | [hooks](https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/) | `.qwen/settings.json` | SessionStart/End, UserPromptSubmit, PostToolUse, PostToolUseFailure (`write_file`, `edit`, `read_file`, `run_shell_command`), Stop, SubagentStart/Stop | `tool_input.file_path` | category; failed from PostToolUseFailure | `PreToolUse`, `PermissionRequest` |
| GitHub Copilot (CLI, VS Code Copilot harness, Copilot app) | [hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference), [VS Code](https://code.visualstudio.com/docs/agent-customization/hooks) | `.github/copilot/settings.local.json` (inline `hooks`) | sessionStart/End, userPromptSubmitted, postToolUse, postToolUseFailure, agentStop, subagentStart/Stop | none (create/edit arguments are not documented) | category from `toolArgs.command` (bash); failed from postToolUseFailure | `preToolUse` (a crashed hook denies), `permissionRequest` |
| Factory Droid | [hooks reference](https://docs.factory.com/reference/hooks-reference) | `.factory/hooks.json` | SessionStart/End, UserPromptSubmit, PostToolUse (`Create`, `Edit`, `ApplyPatch`, `Execute`), Stop, SubagentStop | `Create.file_path` only | category (`Execute.command`) | `PreToolUse` |
| Grok Build (xAI) | [hooks](https://docs.x.ai/build/features/hooks) | `.grok/hooks/code-resonance.json` | SessionStart/End, UserPromptSubmit, PostToolUse, PostToolUseFailure, Stop | none (`toolInput` fields are not documented) | none (tools by name only) | `PreToolUse`, subagent events (no documented identity) |
| goose | [hooks](https://goose-docs.ai/docs/guides/context-engineering/hooks/), [plugins](https://goose-docs.ai/docs/guides/context-engineering/plugins/) | `.agents/plugins/code-resonance/hooks/hooks.json` (a hook-only project plugin) | SessionStart/End, UserPromptSubmit, PostToolUse, PostToolUseFailure (`shell`, `write`, `edit`), Stop | `write`/`edit` `tool_input.path` | category (`shell.command`); failed from PostToolUseFailure | `PreToolUse` |

How each tool treats the adapter's empty output, and what it needs before project hooks run:

| Tool | Empty stdout with exit 0 | Trust before project hooks run |
| --- | --- | --- |
| Gemini CLI | stdout is parsed as JSON. Non-JSON output "will default to Allow" and is shown as a system message. The docs recommend printing `{}`; the adapter prints nothing. | Trusted folder. Gemini CLI fingerprints each project hook (by name and command) and asks before it runs a new one. |
| Qwen Code | Only a JSON object on stdout carries a decision; other stdout is plain text. | Trusted folder. Hooks are read when a session starts, or after `/hooks` is opened. |
| GitHub Copilot | "Empty output uses default behavior." Non-timeout errors on `preToolUse` deny, so `preToolUse` is never installed. | Copilot CLI loads repository hooks in a trusted folder (or with `--trust-folder`). The cloud agent does not read `settings.local.json`. |
| Factory Droid | stdout is shown, or added as context on SessionStart/UserPromptSubmit. Only JSON or exit 2 decides. | Snapshot at start, with a warning when the file changes outside Droid. |
| Grok Build | "For passive events, stdout is ignored." `PreToolUse` is the only blocking event. | `/hooks-trust` or `--trust` (stored in `~/.grok/trusted_folders.toml`). |
| goose | "Exit 0 with empty stdout allows." Only `PreToolUse` and `Stop` can block. | None documented. Review the file before writing it. |

**No exit codes.** None of the six new tools documents a shell exit code in its hook payload. Their shell commands
therefore show a category and, at most, *failed*. A test run counts as validation (red, then green) only through VS
Code capture or a payload that carries an exit code (Claude Code, Codex, Cursor).

## Tools without an adapter, and why

| Tool | Documentation checked | What it offers | Why there is no adapter |
| --- | --- | --- | --- |
| Kimi Code CLI (Moonshot) | [hooks](https://moonshotai.github.io/kimi-code/en/customization/hooks.html) | `[[hooks]]` in `~/.kimi-code/config.toml`, PreToolUse/PostToolUse/… | User-level only ("there is no project-level hook file"), so it would apply to every workspace. The payload's tool-name, prompt and result fields are not named. The older `kimi-cli` is archived. Use `event.js --provider kimi`. |
| Cline | [hooks (now points to SDK plugins)](https://docs.cline.bot/customization/hooks), [.clineignore guide](https://docs.cline.bot/customization/clineignore) | Executable files named after events in `.clinerules/hooks/` (extension) or `.cline/hooks/` (CLI) | The contract requires JSON on stdout ("must return JSON on stdout"), so an adapter that never prints has no documented footing. The payload differs between the extension and the SDK, and the page now points to SDK plugins. Use `event.js --provider cline`. |
| Windsurf (Cascade) | [archived hooks page](https://web.archive.org/web/20260516140338/https://docs.windsurf.com/windsurf/cascade/hooks.md), [Devin Desktop FAQ](https://docs.devin.ai/desktop/devin-desktop-faq) | `.windsurf/hooks.json`, `post_write_code` with `tool_info.file_path` | Windsurf became Devin Desktop on 2026-06-02, and Cascade is legacy (no new conversations). Devin Local's hooks (`.devin/hooks.v1.json`) do not document a file path for write/edit. |
| Kiro | [hooks](https://kiro.dev/docs/hooks/), [actions](https://kiro.dev/docs/hooks/actions/) | Shell-command hooks in `.kiro/hooks/*.json` | The docs disagree on the file schema (`trigger`/`action` versus `when`/`then`) and on blocking (the IDE tab says any non-zero exit blocks `PreToolUse`). Write-tool inputs and the SessionStart payload are not documented. |
| Augment (Auggie CLI) | [hooks 1.x](https://docs.augmentcode.com/cli/hooks), [hooks 0.x](https://docs.augmentcode.com/cli/v0/hooks) | `.augment/settings.local.json`, `file_changes[].path` | Stable 0.x requires the command to be a `.sh`/`.ps1`/`.cmd`/`.bat` script path, so `node "<adapter>"` is invalid. 1.x accepts it but is a prerelease. |
| JetBrains Junie | [CLI hooks](https://junie.jetbrains.com/docs/junie-cli-hooks.html) | `hooks` in `~/.junie/config.json` | Early Access, user-level only (project hooks are ignored by default), and no PostToolUse. |
| OpenCode | [plugins](https://opencode.ai/docs/plugins/), [v2 plugins](https://opencode.ai/v2/docs/build/plugins) | JS/TS plugins in `.opencode/plugins/` | Plugins are code, not a hook file. v1 (1.19) and v2 (2.2) have incompatible plugin APIs live at once, and the event payload fields are given by the SDK's type definitions rather than the plugin page. An adapter would need a generated plugin file, which the review flow (a JSON diff) does not handle. |
| Amp | [plugins](https://ampcode.com/docs/customize/plugins), [plugin API](https://ampcode.com/docs/plugin-api) | JS/TS plugins in `.amp/plugins/` | Code plugins, and `tool.call` is a request event that must return a decision. The edit/create input fields and the shell tool's name are not documented. |
| Continue (`cn`) | [docs](https://docs.continue.dev/) | No documented hooks | Nothing documented to implement. |
| Roo Code | [docs](https://docs.roocode.com/) | — | The extension was shut down on 2026-05-15. |
| Aider | [options](https://aider.chat/docs/config/options.html), [lint/test](https://aider.chat/docs/usage/lint-test.html) | `--lint-cmd`, `--notifications-command` | No hook or event system. A lint command's non-zero exit is treated as lint errors, so it is not observe-only. |
| Zed agent | [AI docs](https://zed.dev/docs/ai/overview), [tasks](https://zed.dev/docs/tasks) | Task hooks (`create_worktree`) only | No agent hook mechanism. |

All of these, except Continue, Roo Code and Zed, have a CAST name, so `event.js --provider <id>` shows them by name
(below).

## The CAST catalog

There are eight seats (0–7). Each seat is a colour, a signal shape and a voice, both in every world and in the score.
Seats 6 and 7 also hold uncatalogued ids, by hash. The first six providers keep their seats; later providers share a
seat with one of them. On the Stage they are told apart by their **chip** (and callouts and hover cards), not by
colour. The player numbers sessions per chip, so *Gemini 2* never counts a Kimi session.

| Seat | Providers (id → name) |
| --- | --- |
| 0 | `claude-code` Claude |
| 1 | `cursor` Cursor |
| 2 | `codex` Codex |
| 3 | `grok` Grok · `goose` Goose · `windsurf` Windsurf |
| 4 | `qwen` Qwen · `opencode` OpenCode · `augment` Augment |
| 5 | `kimi` Kimi · `gemini` Gemini · `kiro` Kiro |
| 6 | `copilot` Copilot · `cline` Cline · `junie` Junie · uncatalogued ids (by hash) |
| 7 | `droid` Droid · `amp` Amp · `aider` Aider · uncatalogued ids (by hash) |

Any other id is shown as *Agent*. The Control Center names it by the id it reported.

## Known limits

- **Tools that read other tools' hook files.** Copilot CLI and VS Code's Copilot harness also read the repository's
  `.claude/settings.json` and `.claude/settings.local.json`. Grok Build reads `.claude/settings.json` and
  `.cursor/hooks.json`. Devin reads `.claude/settings*.json`. With Claude Code's hooks installed (in
  `.claude/settings.local.json`), a Copilot session in that project also runs the Claude Code adapter, with Copilot's
  VS Code-compatible (snake_case) payload. Those events can be attributed to Claude. Which payload Grok Build sends to
  hooks in Claude Code's or Cursor's files is not documented. If it is Grok's own camelCase shape, the Claude Code
  and Cursor adapters make no events of it.
- **goose's plugin folder** follows the Open Plugins layout (`.agents/plugins`). Another agent that discovers project
  plugins there would run the adapter too, and its events would read as goose if the payload has the same shape.
- **Copilot** shows tools and categories but no files. **Grok Build** shows tools by name only. **Droid** names files
  only for `Create`.
- **Subagents.** Copilot subagents are identified by name (two of the same name share a voice), and so are Droid
  sub-droids (by task). Grok subagents are not observed. Every adapter keys a subagent as its session's key, a `/` and
  the subagent's id, name, type or task, in its parent's session. Since interpretation 11 the receiver uses that to name
  a subagent's parent (`subject.parentAgentId`, the parent's public id, on the subagent's `agent.state` intents) once it
  has observed the parent's session; it never guesses one. Cursor and Droid report only a subagent's stop, so their
  subagents appear, with their parent, only as they finish. A Codex `SubagentStart` without an agent id is the
  session's own event and names no parent.
