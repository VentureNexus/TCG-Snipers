#!/usr/bin/env bash
# publish-release.sh — Create and push an annotated release tag for TCG Snipers.
#
# Usage:
#   ./scripts/publish-release.sh <version>
#   ./scripts/publish-release.sh 1.0.21
#
# What this does:
#   1. Verifies the version in artifacts/sniper-bot/package.json matches <version>
#   2. Checks that no git tag v<version> already exists
#   3. Creates an annotated git tag v<version> pointing to HEAD
#   4. Pushes the tag to origin — this triggers the release.yml workflow which
#      builds installers on Windows + macOS and publishes them to GitHub Releases
#
# Prerequisites:
#   - git remote 'origin' must be authenticated (SSH key or GITHUB_TOKEN)
#   - The version in artifacts/sniper-bot/package.json must already be bumped
#     to <version> and committed before running this script

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>  (e.g. $0 1.0.21)" >&2
  exit 1
fi

VERSION="$1"
TAG="v${VERSION}"
PKG="artifacts/sniper-bot/package.json"

# 1. Verify package.json version matches
PKG_VERSION=$(node -e "process.stdout.write(require('./${PKG}').version)")
if [[ "$PKG_VERSION" != "$VERSION" ]]; then
  echo "ERROR: ${PKG} has version ${PKG_VERSION}, expected ${VERSION}." >&2
  echo "Bump the version in ${PKG}, commit it, then re-run this script." >&2
  exit 1
fi

# 2. Check the tag doesn't already exist locally or remotely
if git --no-optional-locks rev-parse --verify "refs/tags/${TAG}" &>/dev/null; then
  echo "ERROR: Tag ${TAG} already exists locally. Aborting." >&2
  exit 1
fi
if git ls-remote --tags origin "refs/tags/${TAG}" | grep -q "${TAG}"; then
  echo "ERROR: Tag ${TAG} already exists on remote origin. Aborting." >&2
  exit 1
fi

echo "Creating annotated tag ${TAG} at HEAD ($(git --no-optional-locks rev-parse --short HEAD))..."
git tag -a "${TAG}" -m "Release ${TAG}"

echo "Pushing tag ${TAG} to origin..."
git push origin "${TAG}"

echo ""
echo "Done. The release.yml workflow has been triggered."
echo "Monitor the build at:"
echo "  https://github.com/VentureNexus/TCG-Snipers/actions/workflows/release.yml"
echo ""
echo "The GitHub Release will be published automatically at:"
echo "  https://github.com/VentureNexus/TCG-Snipers/releases/tag/${TAG}"
