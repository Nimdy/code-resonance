# Repository

Public repository: [`Nimdy/code-resonance`](https://github.com/Nimdy/code-resonance), released under the
[MIT License](LICENSE). Work happens on feature branches with reviewable pull requests; `main` is not pushed to directly.
Pull requests are merged with merge commits. How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md).

Security issues: report them privately, as [SECURITY.md](SECURITY.md#reporting-a-vulnerability) describes, not in a
public issue.

`scripts/publish-private.sh` was used for the initial publication, while the repository was still private. It creates
the repository with `--private`, refuses to push to a public or existing remote, and never force-pushes. It is kept for
reference only.

Never commit receiver data (`~/.code-resonance/`), tokens, recordings or exports.
