import { Router } from "express";
import { db, licensesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { signDownloadToken, verifyDownloadToken, verifyPortalSession } from "../lib/jwt";
import {
  getInstallerFile,
  getInstallerObjectKey,
  getSignedInstallerUrl,
  hasBucket,
} from "../lib/storage";
import { getLatestReleaseLookup } from "../lib/githubReleases";

const router: Router = Router();

const OS_LABELS: Record<string, string> = {
  win: "Windows",
  mac: "macOS",
  linux: "Linux",
};

function detectOs(ua: string, hint?: string): "win" | "mac" | "linux" {
  if (hint === "win" || hint === "mac" || hint === "linux") return hint;
  const u = ua.toLowerCase();
  if (u.includes("mac")) return "mac";
  if (u.includes("linux")) return "linux";
  return "win";
}

/**
 * Detect CPU architecture for macOS downloads.
 *
 * Priority:
 *   1. Explicit `arch` query param ("arm64" or "x64").
 *   2. User-Agent sniffing — Apple Silicon Macs running native browsers
 *      send "Mac OS X" without "Intel" in the UA string; Intel Macs include
 *      "Intel Mac OS X". This is a best-effort heuristic; explicit `arch`
 *      param is the reliable path when the caller knows the arch.
 *
 * Defaults to "arm64" (Apple Silicon) when the arch cannot be determined —
 * arm64 installers run on both Apple Silicon natively and Intel via Rosetta 2.
 */
function detectMacArch(ua: string, hint?: string): "arm64" | "x64" {
  if (hint === "arm64" || hint === "x64") return hint;
  // Intel Macs include "Intel" in the platform string.
  if (ua.toLowerCase().includes("intel mac")) return "x64";
  return "arm64";
}

/**
 * Resolve a gated (authenticated) download URL for a given OS.
 *
 * Priority:
 *  1. GCS V4 signed URL (15 min expiry) — requires GCS_SA_KEY + bucket.
 *     The browser downloads directly from GCS — no API server bandwidth used.
 *  2. Internal proxy token → /download/file/:os streaming endpoint — used when
 *     the bucket is configured but no SA key is present (e.g. Replit dev env).
 *  3. 503 if no bucket is configured (installers not yet deployed to GCS).
 *
 * NOTE: GitHub Releases public CDN URLs are intentionally excluded.
 * Those are unauthenticated and shareable — returning them would let customers
 * bypass the subscription gate by sharing the link.
 */
async function resolveGatedDownloadUrl(
  os: "win" | "mac" | "linux",
  arch: "arm64" | "x64",
  customerId: number,
): Promise<{ url?: string; source?: string; expiresIn?: number }> {
  const objectKey = getInstallerObjectKey(os, arch);

  // No installer configured for this OS (linux is out-of-scope per task).
  if (!objectKey || !hasBucket()) {
    return {};
  }

  // Primary: V4 signed URL — browser downloads directly from GCS.
  const signedUrl = await getSignedInstallerUrl(objectKey, 900);
  if (signedUrl) {
    return { url: signedUrl, source: "gcs-signed", expiresIn: 900 };
  }

  // Fallback: issue a short-lived proxy token and return a URL to our
  // /download/file/:os endpoint which streams from GCS through the API.
  // Used in Replit dev environment where GCS_SA_KEY is absent.
  const dt = signDownloadToken({ customerId, os, arch });
  const base = process.env.DOWNLOAD_BASE_URL ?? "https://tcgsnipers.replit.app";
  const url = `${base}/license/download/file/${os}?t=${encodeURIComponent(dt)}&arch=${arch}`;
  return { url, source: "gcs-stream", expiresIn: 300 };
}

router.get("/download/installer", async (req, res) => {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = verifyPortalSession(token);
  if (!session) {
    res.status(401).json({ error: "Session expired. Request a new magic link." });
    return;
  }

  const license = (
    await db
      .select()
      .from(licensesTable)
      .where(and(eq(licensesTable.customerId, session.customerId), eq(licensesTable.status, "active")))
      .orderBy(desc(licensesTable.createdAt))
      .limit(1)
  )[0];
  if (!license) {
    res.status(403).json({ error: "Active subscription required to download." });
    return;
  }

  const ua = req.headers["user-agent"] ?? "";
  const os = detectOs(ua, String(req.query.os ?? ""));
  const arch = detectMacArch(ua, String(req.query.arch ?? ""));

  const resolved = await resolveGatedDownloadUrl(os, arch, session.customerId);

  if (!resolved.url) {
    // GitHub release metadata used only for the diagnostic tag note, not as
    // a download source (those are publicly shareable unsigned URLs).
    const lookup = await getLatestReleaseLookup();
    const tagNote = lookup.latestTagSeen
      ? ` (latest release tag: ${lookup.latestTagSeen} — installer pending upload to cloud storage)`
      : "";
    req.log?.info({ os, arch, latestTagSeen: lookup.latestTagSeen }, "installer not available");
    res.status(503).json({
      error: `The ${OS_LABELS[os] ?? os} installer is coming soon. We're finishing code-signing and notarization${tagNote}. Email support@tcgsnipers.com if you'd like early access.`,
      os,
      comingSoon: true,
      latestTagSeen: lookup.latestTagSeen,
    });
    return;
  }

  req.log?.info({ os, arch, source: resolved.source }, "installer resolved");
  // GCS signed URLs expire in 15 min — cache response for 4 min so the link
  // is still valid when the browser acts on it. Proxy tokens last 5 min.
  const maxAge = resolved.source === "gcs-signed" ? 240 : 180;
  res.set("Cache-Control", `private, max-age=${maxAge}`);
  res.json({ url: resolved.url, os, arch, expiresIn: resolved.expiresIn ?? 600 });
});

/**
 * Streaming / signed-URL redirect fallback for authenticated download tokens.
 *
 * When GCS_SA_KEY is available, generates a fresh V4 signed URL and issues a
 * 302 redirect so the browser downloads directly from GCS — no API server
 * bandwidth consumed for large binaries.
 *
 * When GCS_SA_KEY is absent (Replit dev env), streams the file through the
 * API server from the Replit-managed GCS bucket using the external_account
 * credentials (which support reads but not URL signing).
 */
router.get("/download/file/:os", async (req, res) => {
  const os = req.params.os as "win" | "mac" | "linux";
  if (!["win", "mac", "linux"].includes(os)) {
    res.status(400).send("Bad OS");
    return;
  }

  const t = String(req.query.t ?? "");
  const payload = verifyDownloadToken(t);
  if (!payload || payload.os !== os) {
    res.status(401).send("Download link expired. Return to the downloads page and click again.");
    return;
  }

  // Resolve arch from the token (set when the proxy token was issued) so the
  // correct platform-specific installer is served.
  const arch: "arm64" | "x64" = payload.arch === "x64" ? "x64" : "arm64";
  const objectKey = getInstallerObjectKey(os, arch);
  if (!objectKey) {
    res.status(503).send("Installer not configured for this OS.");
    return;
  }

  // Prefer signed URL redirect over streaming (no API-server bandwidth used).
  const signedUrl = await getSignedInstallerUrl(objectKey, 900);
  if (signedUrl) {
    res.setHeader("Cache-Control", "private, no-store");
    res.redirect(302, signedUrl);
    return;
  }

  // Streaming fallback — Replit dev env or SA key misconfigured.
  try {
    const file = getInstallerFile(objectKey);
    const [meta] = await file.getMetadata();
    const filename = objectKey.split("/").pop() ?? `TCGSnipers-${os}`;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (meta.size) res.setHeader("Content-Length", String(meta.size));
    res.setHeader("Cache-Control", "private, no-store");
    file
      .createReadStream()
      .on("error", (err) => {
        req.log?.error({ err, os, arch, objectKey }, "installer stream error");
        if (!res.headersSent) res.status(500).send("Stream failed.");
        else res.destroy();
      })
      .pipe(res);
  } catch (err) {
    req.log?.error({ err, os, arch, objectKey }, "installer fetch error");
    if (!res.headersSent) res.status(500).send("Could not fetch installer.");
  }
});

export default router;
