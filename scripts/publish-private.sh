#!/usr/bin/env bash
set -euo pipefail
# One-command private GitHub creation/push on a machine with authenticated GitHub CLI.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OWNER="${1:-Nimdy}"
REPO="${2:-code-resonance}"
if ! command -v git >/dev/null 2>&1; then echo 'git is required' >&2;exit 1;fi
if ! command -v gh >/dev/null 2>&1; then
  echo 'GitHub CLI (gh) is required; alternatively make an empty PRIVATE repo via github.com/new.' >&2;exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo 'Run gh auth login first. Refusing to publish without authentication.' >&2;exit 1
fi
cd "$ROOT"
if [ ! -d .git ]; then
  git init -b main
  git add -A
  git -c user.name='Code Resonance Build' -c user.email='code-resonance@users.noreply.github.com' commit -m 'feat: standalone Code Resonance 0.2.0'
fi
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  echo 'Commit or discard local modifications before publishing.' >&2;exit 1
fi
if git remote get-url origin >/dev/null 2>&1; then
  echo 'Origin remote already exists. Refusing to change or force-push it.' >&2;exit 1
fi
if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  visibility="$(gh repo view "$OWNER/$REPO" --json visibility --jq .visibility)"
  if [ "$visibility" != 'PRIVATE' ]; then echo "REFUSING: Existing repository visibility is $visibility" >&2;exit 2;fi
  git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
else
  gh repo create "$OWNER/$REPO" --private --source=. --remote=origin --push
fi
visibility="$(gh repo view "$OWNER/$REPO" --json visibility --jq .visibility)"
if [ "$visibility" != 'PRIVATE' ]; then echo "REFUSING: Repository visibility is $visibility" >&2;exit 2;fi
echo "Private repository published: https://github.com/$OWNER/$REPO"
