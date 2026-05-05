#!/usr/bin/env bash
# publish-release.sh — Collect changelog, update RELEASES.md, commit, tag, and push.
#
# Use this script when you have already bumped and committed the version in
# artifacts/sniper-bot/package.json manually. For an all-in-one flow that
# also bumps the version, use scripts/release.sh instead.
#
# Usage:
#   ./scripts/publish-release.sh <version>
#   ./scripts/publish-release.sh 1.0.21
#
# What this does:
#   1. Verifies the version in artifacts/sniper-bot/package.json matches <version>
#   2. Checks that no git tag v<version> already exists
#   3. Prompts for changelog entries
#   4. Prepends a new entry to RELEASES.md (with changelog, date, and asset table)
#   5. Commits RELEASES.md: "chore(release): update RELEASES.md for vX.Y.Z"
#   6. Creates an annotated git tag v<version> pointing to HEAD
#   7. Pushes the commit and tag to origin — triggers the release.yml workflow
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

# 2. Ensure working tree is clean (no uncommitted or untracked changes)
if [[ -n "$(git --no-optional-locks status --porcelain)" ]]; then
  echo "ERROR: Working tree is not clean. Commit, stash, or remove all changes first." >&2
  git --no-optional-locks status --short >&2
  exit 1
fi

# 3. Check the tag doesn't already exist locally or remotely
if git --no-optional-locks rev-parse --verify "refs/tags/${TAG}" &>/dev/null; then
  echo "ERROR: Tag ${TAG} already exists locally. Aborting." >&2
  exit 1
fi
if git ls-remote --tags origin "refs/tags/${TAG}" | grep -q "${TAG}"; then
  echo "ERROR: Tag ${TAG} already exists on remote origin. Aborting." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Derive repo slug for GitHub URLs
# ---------------------------------------------------------------------------
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
REPO_SLUG="$(echo "${REMOTE_URL}" \
  | sed -E 's|.*github\.com[:/](.+)\.git$|\1|; s|.*github\.com[:/](.+)$|\1|')"
GITHUB_RELEASE_URL="https://github.com/${REPO_SLUG}/releases/tag/${TAG}"
DOWNLOAD_BASE="https://github.com/${REPO_SLUG}/releases/download/${TAG}"

# ---------------------------------------------------------------------------
# 3. Collect changelog entries interactively
# ---------------------------------------------------------------------------
echo ""
echo "=== Changelog for ${TAG} ==="
echo "Enter one change per line. Press Enter on an empty line when done."
echo ""

CHANGELOG_LINES=()
while IFS= read -r -p "  - " entry; do
  [[ -z "$entry" ]] && break
  CHANGELOG_LINES+=("$entry")
done

if [[ ${#CHANGELOG_LINES[@]} -eq 0 ]]; then
  echo "ERROR: At least one changelog entry is required." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Prepend new entry to RELEASES.md
# ---------------------------------------------------------------------------
DATE="$(date +%Y-%m-%d)"
RELEASES_MD="RELEASES.md"

# Build the changelog bullet list
CHANGELOG_BLOCK=""
for entry in "${CHANGELOG_LINES[@]}"; do
  CHANGELOG_BLOCK="${CHANGELOG_BLOCK}"$'\n'"- ${entry}"
done

# Build the full new section
NEW_SECTION="## ${TAG} — ${DATE}

**GitHub Release:** ${GITHUB_RELEASE_URL}

### Assets (9 files)

| File | Size |
|---|---|
| [TCGSnipers-${VERSION}-x64-win.exe](${DOWNLOAD_BASE}/TCGSnipers-${VERSION}-x64-win.exe) | — |
| TCGSnipers-${VERSION}-x64-win.exe.blockmap | — |
| TCGSnipers-${VERSION}-x64-win.zip | — |
| [TCGSnipers-${VERSION}-arm64.dmg](${DOWNLOAD_BASE}/TCGSnipers-${VERSION}-arm64.dmg) | — |
| TCGSnipers-${VERSION}-arm64.dmg.blockmap | — |
| TCGSnipers-${VERSION}-arm64.zip | — |
| TCGSnipers-${VERSION}-arm64.zip.blockmap | — |
| latest.yml (Windows auto-update) | — |
| latest-mac.yml (macOS auto-update) | — |

### Changes
${CHANGELOG_BLOCK}

---"

echo "Updating ${RELEASES_MD}..."

# Insert the new section after the first "---" divider (ends the how-to-publish block)
node - <<JSEOF
const fs = require('fs');
const filePath = '${RELEASES_MD}';
const content = fs.readFileSync(filePath, 'utf8');
const divider = '\n---\n';
const insertAfter = content.indexOf(divider);
if (insertAfter === -1) {
  process.stderr.write('ERROR: Could not find insertion point in ' + filePath + '\n');
  process.exit(1);
}
const before = content.slice(0, insertAfter + divider.length);
const after  = content.slice(insertAfter + divider.length);
const newSection = ${NEW_SECTION@Q};
fs.writeFileSync(filePath, before + '\n' + newSection + '\n\n' + after.trimStart());
JSEOF

# ---------------------------------------------------------------------------
# 5. Commit RELEASES.md
# ---------------------------------------------------------------------------
echo "Committing release notes..."
git add "${RELEASES_MD}"
git commit -m "chore(release): update RELEASES.md for ${TAG}"

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

echo ""
echo "Done. The release.yml workflow has been triggered."
echo "Monitor the build at:"
echo "  https://github.com/${REPO_SLUG}/actions/workflows/release.yml"
echo ""
echo "The GitHub Release will be published automatically at:"
echo "  ${GITHUB_RELEASE_URL}"
echo ""
echo "NOTE: File sizes in RELEASES.md are shown as '—' until the build completes."
echo "      After the release is published, run:"
echo "      ./scripts/update-release-sizes.sh ${VERSION}"
echo "      to fill in the actual sizes from the GitHub Release."
echo ""
