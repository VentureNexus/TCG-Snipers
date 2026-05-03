import { Router } from "express";
import { getLatestRelease } from "../lib/githubReleases";

const router: Router = Router();

const MARKETING_URL = (process.env.MARKETING_SITE_URL ?? "https://tcgsnipers.com").replace(/\/$/, "");

// Public version manifest. The desktop app polls this every 6 hours.
//
// Source of truth is GitHub Releases — once a new release is published in
// https://github.com/<GITHUB_RELEASES_REPO>/releases the manifest picks up
// the new version automatically (cached 5 min in-process).
//
// Env var fallbacks (used only if the GitHub API is unreachable):
//   LATEST_APP_VERSION         default "1.0.0"
//   MIN_SUPPORTED_APP_VERSION  default "1.0.0"
router.get("/version", async (_req, res) => {
  const release = await getLatestRelease();
  const latest = release?.version ?? process.env.LATEST_APP_VERSION ?? "1.0.0";
  const minSupported = process.env.MIN_SUPPORTED_APP_VERSION ?? "1.0.0";

  // 5 min fresh + 10 min stale-while-revalidate so a brief GitHub outage
  // never blocks update checks for the desktop app.
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json({
    latest,
    minSupported,
    downloadUrl: `${MARKETING_URL}/download`,
    releaseNotesUrl: `${MARKETING_URL}/changelog`,
  });
});

export default router;
