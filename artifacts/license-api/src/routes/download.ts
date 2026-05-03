import { Router } from "express";
import { db, licensesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { signDownloadToken, verifyDownloadToken, verifyPortalSession } from "../lib/jwt";
import { getInstallerFile, getInstallerObjectKey } from "../lib/storage";

const router: Router = Router();

const OS_LABELS: Record<string, string> = {
  win: "Windows",
  mac: "macOS",
  linux: "Linux",
};

// Override URLs (e.g. external CDN) — if set, we redirect to these instead of streaming from GCS.
const OVERRIDE_URLS: Record<string, string | undefined> = {
  win: process.env.INSTALLER_URL_WIN,
  mac: process.env.INSTALLER_URL_MAC,
  linux: process.env.INSTALLER_URL_LINUX,
};

function detectOs(ua: string, hint?: string): "win" | "mac" | "linux" {
  if (hint === "win" || hint === "mac" || hint === "linux") return hint;
  const u = ua.toLowerCase();
  if (u.includes("mac")) return "mac";
  if (u.includes("linux")) return "linux";
  return "win";
}

function installerAvailable(os: "win" | "mac" | "linux"): boolean {
  return Boolean(OVERRIDE_URLS[os] || getInstallerObjectKey(os));
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

  const os = detectOs(req.headers["user-agent"] ?? "", String(req.query.os ?? ""));
  if (!installerAvailable(os)) {
    res.status(503).json({
      error: `The ${OS_LABELS[os] ?? os} build is coming soon. We're finishing code-signing and notarization. Email support@tcgsnipers.com if you'd like early access.`,
      os,
      comingSoon: true,
    });
    return;
  }

  // External override wins (e.g. CDN-hosted)
  const override = OVERRIDE_URLS[os];
  if (override) {
    res.json({ url: override, os, expiresIn: 600 });
    return;
  }

  // Otherwise issue a short-lived token and return an absolute URL to the
  // License API itself. We avoid the Vercel proxy for large binaries — the
  // browser hits Replit directly at tcgsnipers.replit.app.
  const dt = signDownloadToken({ customerId: session.customerId, os });
  const base = process.env.DOWNLOAD_BASE_URL ?? "https://tcgsnipers.replit.app";
  const url = `${base}/license/download/file/${os}?t=${encodeURIComponent(dt)}`;
  res.json({ url, os, expiresIn: 300 });
});

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

  const objectKey = getInstallerObjectKey(os);
  if (!objectKey) {
    res.status(503).send("Installer not configured.");
    return;
  }

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
        req.log?.error({ err, os, objectKey }, "installer stream error");
        if (!res.headersSent) res.status(500).send("Stream failed.");
        else res.destroy();
      })
      .pipe(res);
  } catch (err) {
    req.log?.error({ err, os, objectKey }, "installer fetch error");
    if (!res.headersSent) res.status(500).send("Could not fetch installer.");
  }
});

export default router;
