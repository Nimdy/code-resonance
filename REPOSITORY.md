# Private GitHub publishing

Code Resonance is intentionally **not** part of Signal/3. Publish it to its own new private repository, recommended `Nimdy/code-resonance`.

## One-command publish (on your workstation)

This source archive works as an uninitialized source tree or an already-initialized Git repository.

1. Install and authenticate GitHub CLI (`gh auth login`) if not already authenticated.
2. Extract `code-resonance-0.2.0-source.zip` and enter `code-resonance`.
3. Run:

   ```bash
   bash scripts/publish-private.sh Nimdy code-resonance
   ```

The script initializes Git and commits the source if needed; creates `Nimdy/code-resonance` with explicit `--private`, pushes the main branch, and verifies it is **PRIVATE**. It will not push to a public existing repository or force-push an existing remote.

## GitHub website + existing connection

Alternatively, [create an empty repository on GitHub](https://github.com/new), choose owner `Nimdy`, name `code-resonance`, and select **Private**. Do not initialize it with a README if you plan to push the included local Git bundle or source archive via plain Git.

The GitHub connection in this ChatGPT session can operate on an existing repository, but its available actions cannot create a brand-new one. The connected service will be able to confirm the repository once created; no other `Nimdy` repository should be modified for this feature.

## From the included bundle

`code-resonance-0.2.0.bundle` is a complete local Git history with its initial commit:

```bash
 git clone code-resonance-0.2.0.bundle code-resonance
 cd code-resonance
 git remote remove origin
 git remote add origin https://github.com/Nimdy/code-resonance.git
 git push -u origin main
```

Create the **empty private** remote first. Before any push, independently confirm visibility in GitHub. Never commit receiver recordings from `~/.code-resonance/` or local tokens.
