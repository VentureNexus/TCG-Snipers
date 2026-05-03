// Fetches the latest GitHub release for the desktop app and caches the result
// in memory so subsequent /version and /download/installer calls are fast.
//
// Set GITHUB_RELEASES_REPO ("owner/name") to point at a different repo.
// Set GITHUB_TOKEN to raise the unauthenticated 60-req/hour rate limit.

const REPO = process.env.GITHUB_RELEASES_REPO ?? "VentureNexus/TCG-Snipers";
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

export interface ReleaseInfo {
  version: string;
  htmlUrl: string;
  assets: {
    win?: string;
    macArm64?: string;
    macX64?: string;
    linux?: string;
  };
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}
interface GitHubRelease {
  tag_name: string;
  name?: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
}

let cache: { value: ReleaseInfo | null; expiresAt: number } = {
  value: null,
  expiresAt: 0,
};
let inflight: Promise<ReleaseInfo | null> | null = null;

const SEMVER_RE = /(\d+\.\d+\.\d+(?:\.\d+)?)/;

function normalizeVersion(tag: string): string | null {
  const m = tag.match(SEMVER_RE);
  return m ? m[1] : null;
}

function pickAssets(assets: GitHubAsset[]): ReleaseInfo["assets"] {
  const out: ReleaseInfo["assets"] = {};
  for (const a of assets) {
    const n = a.name.toLowerCase();
    if (n.endsWith(".exe")) out.win = a.browser_download_url;
    else if (n.endsWith("-arm64.dmg")) out.macArm64 = a.browser_download_url;
    else if (n.endsWith("-x64.dmg") || (n.endsWith(".dmg") && !out.macX64))
      out.macX64 = a.browser_download_url;
    else if (n.endsWith(".appimage")) out.linux = a.browser_download_url;
  }
  return out;
}

async function fetchLatest(): Promise<ReleaseInfo | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "tcgsnipers-license-api",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const url = `https://api.github.com/repos/${REPO}/releases`;
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const list = (await res.json()) as GitHubRelease[];
    if (!Array.isArray(list)) return null;
    // Pick the newest non-draft release that has at least one installer asset.
    // We deliberately tolerate non-semver tags (e.g. "main") — we extract the
    // version from the asset filenames if the tag itself doesn't parse.
    for (const rel of list) {
      if (rel.draft) continue;
      const assets = pickAssets(rel.assets ?? []);
      if (!assets.win && !assets.macArm64 && !assets.macX64 && !assets.linux) {
        continue;
      }
      // Prefer version from the tag; otherwise sniff from the .exe filename.
      let version = normalizeVersion(rel.tag_name);
      if (!version) {
        const exeName = (rel.assets ?? []).find((a) =>
          a.name.toLowerCase().endsWith(".exe"),
        )?.name;
        if (exeName) version = normalizeVersion(exeName);
      }
      if (!version) continue;
      return { version, htmlUrl: rel.html_url, assets };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getLatestRelease(): Promise<ReleaseInfo | null> {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now) return cache.value;
  if (inflight) return inflight;

  inflight = (async () => {
    const value = await fetchLatest();
    if (value) {
      cache = { value, expiresAt: now + CACHE_TTL_MS };
    } else if (cache.value) {
      // Keep serving the previous value for a short window if GitHub is down.
      cache = { value: cache.value, expiresAt: now + 60 * 1000 };
    }
    inflight = null;
    return value ?? cache.value;
  })();

  return inflight;
}
