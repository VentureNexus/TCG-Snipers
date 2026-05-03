/**
 * afterSign hook called by electron-builder after code-signing the macOS app.
 * Submits the signed .app to Apple's notarization service and staples the
 * ticket so Gatekeeper accepts it on first launch without an internet check.
 *
 * Required environment variables (set as GitHub Actions secrets):
 *   APPLE_ID                  — Apple ID email used to sign in to App Store Connect
 *   APPLE_APP_SPECIFIC_PASSWORD — App-specific password for the Apple ID
 *   APPLE_TEAM_ID             — 10-character Apple Developer Team ID
 *
 * If any of these are absent the hook skips notarization gracefully, which
 * means unsigned/dev builds continue to work without error.
 */

const { notarize } = require("@electron/notarize");

exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds.
  if (electronPlatformName !== "darwin") return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.log(
      "[notarize] Skipping notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set.",
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] Submitting ${appPath} to Apple notarization service…`);

  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });

  console.log("[notarize] Done — notarization ticket stapled.");
};
