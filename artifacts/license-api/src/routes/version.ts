import { Router } from "express";

const router: Router = Router();

const MARKETING_URL = (process.env.MARKETING_SITE_URL ?? "https://tcgsnipers.com").replace(/\/$/, "");

// Public version manifest. Bump LATEST_APP_VERSION (and optionally
// MIN_SUPPORTED_APP_VERSION) when shipping a new desktop build.
//
// - latest:        the newest released version of the desktop app
// - minSupported:  versions older than this are considered hard-broken and
//                  the app should refuse to run / force-update. Leave equal
//                  to or below `latest` for soft notifications only.
router.get("/version", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300"); // 5 min CDN/browser cache
  res.json({
    latest: process.env.LATEST_APP_VERSION ?? "1.0.0",
    minSupported: process.env.MIN_SUPPORTED_APP_VERSION ?? "1.0.0",
    downloadUrl: `${MARKETING_URL}/download`,
    releaseNotesUrl: `${MARKETING_URL}/changelog`,
  });
});

export default router;
