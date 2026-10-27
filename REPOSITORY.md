# Repository

Private repository: `Nimdy/code-resonance`. Work happens on feature branches with reviewable pull requests; `main` is not pushed to directly.

`scripts/publish-private.sh` was used for the initial private publication. It creates the repository with `--private`, refuses to push to a public or existing remote, and never force-pushes. It is kept for reference.

Never commit receiver data (`~/.code-resonance/`), tokens, recordings or exports.
