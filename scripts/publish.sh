#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Invalid bump type \"$BUMP\". Use: patch | minor | major"
  exit 1
fi

echo "=> Running tests"
bun test

echo "=> Building"
bun run build

echo "=> Verifying build"
node dist/cli.js --help

echo "=> Bumping version ($BUMP)"
npm version "$BUMP" --no-git-tag-version

echo "=> Publishing to npm"
npm publish --access=public

echo "Done!"
