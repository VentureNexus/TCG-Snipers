import { Router } from "express";
import { db, licensesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { verifyPortalSession } from "../lib/jwt";

const router: Router = Router();

// Static download URLs configured via env, set after manual installer upload.
// In the future these can be swapped for App Storage signed URLs.
const DOWNLOAD_URLS: Record<string, string | undefined> = {
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

router.get("/download/installer", async (req, res) => {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = verifyPortalSession(token);
  if (!session) {
    res.status(401).json({ error: "Session expired. Request a new magic link." });
    return;
  }

  const license = (await db
    .select()
    .from(licensesTable)
    .where(and(eq(licensesTable.customerId, session.customerId), eq(licensesTable.status, "active")))
    .orderBy(desc(licensesTable.createdAt))
    .limit(1))[0];
  if (!license) {
    res.status(403).json({ error: "Active subscription required to download." });
    return;
  }

  const os = detectOs(req.headers["user-agent"] ?? "", String(req.query.os ?? ""));
  const url = DOWNLOAD_URLS[os];
  if (!url) {
    res.status(503).json({
      error: `Installer for ${os} is not yet available. Please check back soon.`,
      os,
    });
    return;
  }
  res.json({ url, os, expiresIn: 600 });
});

export default router;
