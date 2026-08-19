#!/usr/bin/env bash
# Deploy dist/ to the gh-pages branch (only the built app, no source).
# Usage: ./tools/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▶ building dist/…"
node tools/build.js

ORIGIN=$(git remote get-url origin)
BRANCH=gh-pages

# stash any uncommitted source changes so the branch switch is clean
git stash --include-untracked --keep-index 2>/dev/null || true

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "▶ updating existing $BRANCH branch…"
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH"
else
  echo "▶ creating $BRANCH branch…"
  git checkout --orphan "$BRANCH"
  git rm -rfq . 2>/dev/null || true
fi

# replace tracked files with the fresh build (untracked dist/ from master persists)
git rm -rq --cached . 2>/dev/null || true
rm -rf ./* 2>/dev/null || true
cp -r dist/. .

git add -A
git commit -m "deploy: webNBT-next gh-pages build" --allow-empty
echo "▶ pushing to $ORIGIN ($BRANCH)…"
git push "$ORIGIN" "$BRANCH"

git checkout master 2>/dev/null || true
git stash pop 2>/dev/null || true

PAGES_URL=$(git remote get-url origin | sed -E 's|.*github.com[:/]([^/]+)/(.+)\.git|https://\1.github.io/\2/|')
echo "✓ deployed: $PAGES_URL"