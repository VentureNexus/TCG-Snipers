#!/usr/bin/env bash
# release.sh — Bump version, collect changelog, update RELEASES.md, commit, tag, and push.
#
# Usage:
#   ./scripts/release.sh <version>
#   pnpm release <version>
#
# What this does (in order):
#   1. Validates the version argument looks like X.Y.Z
#   2. Ensures the working tree is clean (no uncommitted changes)
#   3. Checks that no git tag v<version> already exists locally or remotely
#   4. Prompts for changelog entries
#   5. Updates the version field in artifacts/sniper-bot/package.json
#   6. Prepends a new entry to RELEASES.md (with changelog, date, and asset table)
#   7. Commits both files: "chore(sniper-bot): vX.Y.Z"
#   8. Creates an annotated git tag vX.Y.Z pointing to that commit
#   9. Pushes the commit and tag to origin, triggering the release.yml workflow
#  10. Prints the GitHub Actions URL to monitor the build
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
# Derive repo slug for GitHub URLs
# ---------------------------------------------------------------------------
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
REPO_SLUG="$(echo "${REMOTE_URL}" \
  | sed -E 's|.*github\.com[:/](.+)\.git$|\1|; s|.*github\.com[:/](.+)$|\1|')"
GITHUB_RELEASE_URL="https://github.com/${REPO_SLUG}/releases/tag/${TAG}"
DOWNLOAD_BASE="https://github.com/${REPO_SLUG}/releases/download/${TAG}"

# ---------------------------------------------------------------------------
# 4. Collect changelog entries interactively
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
# 5. Bump version in artifacts/sniper-bot/package.json
# ---------------------------------------------------------------------------
echo ""
echo "Bumping ${PKG} to ${VERSION}..."
node - <<EOF
const fs = require('fs');
const path = './${PKG}';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '${VERSION}';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
EOF

# ---------------------------------------------------------------------------
# 6. Prepend new entry to RELEASES.md
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

# Insert the new section after the first "---" divider (which ends the how-to-publish block)
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
# 7. Commit both files
# ---------------------------------------------------------------------------
echo "Committing version bump and release notes..."
git add "${PKG}" "${RELEASES_MD}"
git commit -m "chore(sniper-bot): ${TAG}"

# ---------------------------------------------------------------------------
# 8. Create annotated tag
# ---------------------------------------------------------------------------
echo "Creating annotated tag ${TAG} at HEAD ($(git --no-optional-locks rev-parse --short HEAD))..."
git tag -a "${TAG}" -m "Release ${TAG}"

# ---------------------------------------------------------------------------
# 9. Push commit + tag
# ---------------------------------------------------------------------------
BRANCH="$(git --no-optional-locks rev-parse --abbrev-ref HEAD)"
echo "Pushing commit on branch '${BRANCH}' and tag ${TAG} to origin..."
git push origin "${BRANCH}"
git push origin "${TAG}"

# ---------------------------------------------------------------------------
# 10. Print monitoring URLs
# ---------------------------------------------------------------------------
echo ""
echo "Done! The release.yml workflow has been triggered."
echo ""
if [[ -n "${REPO_SLUG}" ]]; then
  echo "Monitor the build at:"
  echo "  https://github.com/${REPO_SLUG}/actions/workflows/release.yml"
  echo ""
  echo "The GitHub Release will be published automatically at:"
  echo "  ${GITHUB_RELEASE_URL}"
else
  echo "Monitor the build in GitHub Actions → release.yml."
  echo "The GitHub Release will be published automatically under releases/tag/${TAG}."
fi
echo ""
echo "NOTE: File sizes in RELEASES.md are shown as '—' until the build completes."
echo "      After the release is published, run:"
echo "      ./scripts/update-release-sizes.sh ${VERSION}"
echo "      to fill in the actual sizes from the GitHub Release."
echo ""
