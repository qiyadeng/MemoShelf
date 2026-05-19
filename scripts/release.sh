#!/usr/bin/env bash
set -e

BUMP=${1:-patch}

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: ./scripts/release.sh [patch|minor|major]"
  echo "Default: patch"
  exit 1
fi

# Bump version in package.json
NEW_VERSION=$(node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  if ('$BUMP' === 'major') pkg.version = (major + 1) + '.0.0';
  else if ('$BUMP' === 'minor') pkg.version = major + '.' + (minor + 1) + '.0';
  else pkg.version = major + '.' + minor + '.' + (patch + 1);
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log(pkg.version);
")

echo "Releasing v$NEW_VERSION..."

git add package.json
git commit -m "chore: bump version to $NEW_VERSION"
git tag "v$NEW_VERSION"
git push && git push --tags

echo "Done. GitHub Actions is building the release."
echo "Draft will appear at: https://github.com/qiyadeng/MemoShelf/releases"
