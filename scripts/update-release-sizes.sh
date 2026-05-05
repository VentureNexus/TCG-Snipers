#!/usr/bin/env bash
# update-release-sizes.sh — Fetch asset sizes from a published GitHub Release
# and patch the corresponding entry in RELEASES.md.
#
# Usage:
#   ./scripts/update-release-sizes.sh <version>
#   ./scripts/update-release-sizes.sh 1.0.22
#
# Run this after the release.yml build has finished and assets are published.
# It queries the GitHub Releases API (no authentication required for public repos),
# fills in the sizes for every asset in the RELEASES.md entry, and commits the update.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>  (e.g. $0 1.0.22)" >&2
  exit 1
fi

VERSION="$1"
TAG="v${VERSION}"
RELEASES_MD="RELEASES.md"

# Derive the GitHub repo slug from the git remote
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
REPO_SLUG="$(echo "${REMOTE_URL}" \
  | sed -E 's|.*github\.com[:/](.+)\.git$|\1|; s|.*github\.com[:/](.+)$|\1|')"

if [[ -z "${REPO_SLUG}" ]]; then
  echo "ERROR: Could not determine GitHub repo slug from remote URL: ${REMOTE_URL}" >&2
  exit 1
fi

API_URL="https://api.github.com/repos/${REPO_SLUG}/releases/tags/${TAG}"

echo "Fetching release assets for ${TAG} from GitHub..."
ASSET_JSON="$(curl -sf "${API_URL}" || true)"

if [[ -z "${ASSET_JSON}" ]]; then
  echo "ERROR: Could not fetch release data from ${API_URL}" >&2
  echo "Make sure the release is published and try again." >&2
  exit 1
fi

# Check that the release exists and has assets
ASSET_COUNT="$(echo "${ASSET_JSON}" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
process.stdout.write(String((d.assets||[]).length));
")"

if [[ "${ASSET_COUNT}" == "0" ]]; then
  echo "ERROR: Release ${TAG} has no assets yet. Wait for the build to finish." >&2
  exit 1
fi

echo "Found ${ASSET_COUNT} assets. Patching ${RELEASES_MD}..."

# Use Node to parse the asset list and rewrite RELEASES.md
node - <<JSEOF
const fs   = require('fs');
const data = JSON.parse(${ASSET_JSON@Q});
const assets = data.assets || [];

// Build a map: filename -> human-readable size (e.g. "87.0 MB")
const sizeMap = {};
for (const a of assets) {
  const mb = (a.size / 1024 / 1024).toFixed(2);
  // Show as "X.X MB"; keep two decimal places then trim trailing zeros
  const display = parseFloat(mb).toFixed(2).replace(/\.?0+$/, '') + ' MB';
  sizeMap[a.name] = display;
}

let content = fs.readFileSync('${RELEASES_MD}', 'utf8');

// Replace "—" size cells in the matching version section.
// Strategy: find the section header for this tag, then replace only within
// that section (up to the next "---" divider or end of file).
const sectionStart = content.indexOf('## ${TAG} —');
if (sectionStart === -1) {
  process.stderr.write('ERROR: Could not find section for ${TAG} in ${RELEASES_MD}\n');
  process.exit(1);
}
// Find the end of this section (next "---" that is on its own line)
const afterSection = content.indexOf('\n---\n', sectionStart);
const sectionEnd   = afterSection === -1 ? content.length : afterSection + 5;
let section = content.slice(sectionStart, sectionEnd);

// Replace each "| — |" cell in table rows that contain a known filename
for (const [name, size] of Object.entries(sizeMap)) {
  // Match a table row that contains the file name and has "—" as its size column
  const rowRe = new RegExp(
    '(\\|[^|]*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^|]*\\|)[^|]*—[^|]*(\\|)',
    'g'
  );
  section = section.replace(rowRe, '\$1 ' + size + ' \$2');
}

content = content.slice(0, sectionStart) + section + content.slice(sectionEnd);
fs.writeFileSync('${RELEASES_MD}', content);
console.log('Done. Updated sizes:');
for (const [name, size] of Object.entries(sizeMap)) {
  console.log('  ' + name + ' → ' + size);
}
JSEOF

echo ""
echo "Committing updated sizes to ${RELEASES_MD}..."
git add "${RELEASES_MD}"
git commit -m "chore(release): add asset sizes to ${RELEASES_MD} for ${TAG}"

echo "Done. RELEASES.md is now up to date with accurate file sizes for ${TAG}."
