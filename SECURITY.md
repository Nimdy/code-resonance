# Security and privacy model

**Capture is opt-in; privacy and data minimization matter more than real-time effects.**

- Receiver binds to loopback by default. Authentication is required for all writes; the bearer token lives at `~/.code-resonance/receiver-auth.json` with restricted local permissions.
- The local Stage API returns only hashed module/symbol IDs, semantic type, normalized performance controls, stats, and categorized cues. It never returns source snapshots, raw prompts or terminal command strings.
- Content-addressed gzip snapshots and raw event journals can contain sensitive code or accidental embedded credentials. Known `.env`, key/credential and generated files are excluded, but filtering is not a proof that data is clean. **Do not capture unknown/sensitive repositories until reviewed.**
- The VS Code extension asks for a trusted workspace and records on explicit Start; persistence across restart is intentional. Stop via Command Palette. Source snapshot capture can be disabled in extension configuration, at the expense of AST semantics.
- Terminal commands and explicit prompt text are disabled by default. Never emit passwords or tokens in hook CLI arguments or raw text.
- AI hidden chain-of-thought is not obtainable; only visible authorized output is eligible for recording. Provider integration is optional.
- HTTP responses send `no-store` and `nosniff`; browser scripts use a self-only CSP. Do not expose port 4174 on the public Internet or a shared LAN. A privileged local user could read capture files or the auth token; this is not a hostile-local-user isolation boundary.
- No analytics, dependency CDNs, SaaS APIs or default remote calls. The parser is a vendored TypeScript distribution with its upstream license.
- Personal recordings are not packaged or committed to Git. Keep `~/.code-resonance/` outside any project tree; do not add it to a repository.

To erase local capture, stop the extension and receiver, then remove the relevant data under `~/.code-resonance/projects/`. To erase all local captures and receiver credentials, remove the entire `~/.code-resonance/` directory while the receiver is stopped and clear the extension's VS Code global storage outbox. There is no remote copy created by this project.

Security issues: do not publish vulnerabilities or example recordings containing secrets in a public issue. Report privately to the repository owner through a trusted channel.
