#!/usr/bin/env bash
# Deploy dist/ to the gh-pages branch (only the built app, no source).
# Usage: ./tools/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ORIGIN=$(git remote get-url origin)
BRANCH=gh-pages
TMPD=$(mktemp -d)

# build into a temp dir — dist/ is tracked on master and would be removed
# by the branch switch, so we must not depend on it in the working tree
echo "▶ building dist/ into temp…"
node tools/build.js "$TMPD"

# stash any uncommitted source changes so the branch switch is clean
git stash --include-untracked --keep-index 2>/dev/null || true

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "▶ updating existing $BRANCH branch…"
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH"
else
  echo "▶ creating $BRANCH branch…"
  git checkout --orphan "$BRANCH"
fi

# drop all tracked files (switch left the branch's own tree)
git rm -rfq . 2>/dev/null || true

# replace root contents with the fresh build
cp -r "$TMPD/." .

git add -A
git commit -m "deploy: webNBT-next gh-pages build" --allow-empty
echo "▶ pushing to $ORIGIN ($BRANCH)…"
# gh-pages is a deploy-artifact branch — force-push is expected
git push --force "$ORIGIN" "$BRANCH"

rm -rf "$TMPD"

git checkout master 2>/dev/null || true
git stash pop 2>/dev/null || true

PAGES_URL=$(git remote get-url origin | sed -E 's|.*github.com[:/]([^/]+)/(.+)\.git|https://\1.github.io/\2/|')
echo "✓ deployed: $PAGES_URL"