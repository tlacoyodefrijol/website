#!/usr/bin/env bash
# Publish public/ as the root of a dedicated branch (default: ovh-deploy),
# so OVH's git integration can clone that branch directly as the doc root
# without pulling in index.js, tests/, source markdown, etc.
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-ovh-deploy}"
WORKTREE=".deploy-worktree"

cd "$(dirname "$0")/.."
npm run build:static

git fetch origin "$BRANCH" 2>/dev/null || true
rm -rf "$WORKTREE"
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git worktree add -B "$BRANCH" "$WORKTREE" "origin/$BRANCH"
else
  git worktree add -B "$BRANCH" "$WORKTREE"
  git -C "$WORKTREE" checkout --orphan "$BRANCH"
  git -C "$WORKTREE" rm -rf . >/dev/null
fi

rsync -a --delete --exclude .git public/ "$WORKTREE/"
git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "Nothing changed — $BRANCH already up to date."
else
  git -C "$WORKTREE" commit -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)" -q
  git -C "$WORKTREE" push origin "$BRANCH" --force
fi

git worktree remove "$WORKTREE" --force
