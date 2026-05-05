#!/usr/bin/env bash
# release.sh — Bump version, commit, tag, and push to trigger the GitHub release.
#
# Usage:
#   ./scripts/release.sh <version>
#   pnpm release <version>
#
# What this does (in order):
#   1. Validates the version argument looks like X.Y.Z
#   2. Ensures the working tree is clean (no uncommitted changes)
#   3. Checks that no git tag v<version> already exists locally or remotely
#   4. Updates the version field in artifacts/sniper-bot/package.json
#   5. Commits the bump: "chore(sniper-bot): vX.Y.Z"
#   6. Creates an annotated git tag vX.Y.Z pointing to that commit
#   7. Pushes the commit and tag to origin, triggering the release.yml workflow
#   8. Prints the GitHub Actions URL to monitor the build
#
# Prerequisites:
#   - git remote 'origin' must be authenticated (SSH key or GITHUB_TOKEN)
#   - node must be available (used to update package.json)

set -euo pipefail

# ---------------------------------------------------------------------------
# 1. Argument validation
# ---------------------------------------------------------------------------
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>  (e.g. $0 1.0.22)" >&2
  exit 1
fi

VERSION="$1"
TAG="v${VERSION}"
PKG="artifacts/sniper-bot/package.json"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: Version must be in X.Y.Z format, got: ${VERSION}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Ensure working tree is clean (tracked changes, staged changes, untracked files)
# ---------------------------------------------------------------------------
if [[ -n "$(git --no-optional-locks status --porcelain)" ]]; then
  echo "ERROR: Working tree is not clean. Commit, stash, or remove all changes first." >&2
  git --no-optional-locks status --short >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Check the tag doesn't already exist
# ---------------------------------------------------------------------------
if git --no-optional-locks rev-parse --verify "refs/tags/${TAG}" &>/dev/null; then
  echo "ERROR: Tag ${TAG} already exists locally. Aborting." >&2
  exit 1
fi
if git ls-remote --tags origin "refs/tags/${TAG}" 2>/dev/null | grep -q "${TAG}"; then
  echo "ERROR: Tag ${TAG} already exists on remote origin. Aborting." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Bump version in artifacts/sniper-bot/package.json
# ---------------------------------------------------------------------------
echo "Bumping ${PKG} to ${VERSION}..."
node - <<EOF
const fs = require('fs');
const path = './${PKG}';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '${VERSION}';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
EOF

# ---------------------------------------------------------------------------
# 5. Commit the version bump
# ---------------------------------------------------------------------------
echo "Committing version bump..."
git add "${PKG}"
git commit -m "chore(sniper-bot): ${TAG}"

# ---------------------------------------------------------------------------
# 6. Create annotated tag
# ---------------------------------------------------------------------------
echo "Creating annotated tag ${TAG} at HEAD ($(git --no-optional-locks rev-parse --short HEAD))..."
git tag -a "${TAG}" -m "Release ${TAG}"

# ---------------------------------------------------------------------------
# 7. Push commit + tag
# ---------------------------------------------------------------------------
BRANCH="$(git --no-optional-locks rev-parse --abbrev-ref HEAD)"
echo "Pushing commit on branch '${BRANCH}' and tag ${TAG} to origin..."
git push origin "${BRANCH}"
git push origin "${TAG}"

# ---------------------------------------------------------------------------
# 8. Print monitoring URLs (derived from git remote so links stay correct if
#    the repo is renamed or this script is used in a fork)
# ---------------------------------------------------------------------------
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
# Normalise SSH (git@github.com:owner/repo.git) and HTTPS URLs to owner/repo
REPO_SLUG="$(echo "${REMOTE_URL}" \
  | sed -E 's|.*github\.com[:/](.+)\.git$|\1|; s|.*github\.com[:/](.+)$|\1|')"

echo ""
echo "Done! The release.yml workflow has been triggered."
echo ""
if [[ -n "${REPO_SLUG}" ]]; then
  echo "Monitor the build at:"
  echo "  https://github.com/${REPO_SLUG}/actions/workflows/release.yml"
  echo ""
  echo "The GitHub Release will be published automatically at:"
  echo "  https://github.com/${REPO_SLUG}/releases/tag/${TAG}"
else
  echo "Monitor the build in GitHub Actions → release.yml."
  echo "The GitHub Release will be published automatically under releases/tag/${TAG}."
fi
echo ""
