import { Router } from "express";
import crypto from "crypto";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";

const router = Router();

interface StateEntry {
  redirectOrigin: string;
  expiresAt: number;
}
const stateStore = new Map<string, StateEntry>();

function pruneExpiredStates() {
  const now = Date.now();
  for (const [k, v] of stateStore) {
    if (v.expiresAt < now) stateStore.delete(k);
  }
}

function getRedirectUri(req: Request): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ??
    req.protocol ??
    "https";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ??
    (req.headers.host as string | undefined) ??
    "localhost";
  return `${proto}://${host}/api/auth/google/callback`;
}

function closePopupHtml(origin: string, payload: Record<string, string>): string {
  const safeOrigin = origin.replace(/"/g, "");
  const payloadJson = JSON.stringify(payload).replace(/<\/script>/gi, "<\\/script>");
  return `<!DOCTYPE html><html><body><script>
    try {
      if (window.opener) {
        window.opener.postMessage(${payloadJson}, "${safeOrigin || "*"}");
      }
    } catch(e) {}
    window.close();
  <\/script><p style="font-family:sans-serif;padding:24px">
    ${payload.type === "google_auth_success"
      ? `Google account connected (${payload.email}). You can close this window.`
      : `Sign-in failed: ${payload.error ?? "Unknown error"}. You can close this window.`}
  </p></body></html>`;
}

router.get("/auth/google/start", (req: Request, res: Response): void => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    res.status(503).send("Google OAuth is not configured on this server.");
    return;
  }

  pruneExpiredStates();
  const redirectOrigin = (req.query.redirect_origin as string) ?? "";
  const state = crypto.randomBytes(16).toString("hex");
  stateStore.set(state, { redirectOrigin, expiresAt: Date.now() + 10 * 60_000 });

  const redirectUri = getRedirectUri(req);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "email openid https://mail.google.com/");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  res.redirect(authUrl.toString());
});

router.get("/auth/google/callback", async (req: Request, res: Response): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;

  const stateData = state ? stateStore.get(state) : undefined;
  if (state) stateStore.delete(state);
  const redirectOrigin = stateData?.redirectOrigin ?? "";

  if (error || !code) {
    res.send(closePopupHtml(redirectOrigin, { type: "google_auth_error", error: error ?? "no_code" }));
    return;
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.send(closePopupHtml(redirectOrigin, { type: "google_auth_error", error: "Server not configured" }));
    return;
  }

  const redirectUri = getRedirectUri(req);

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description ?? "Token exchange failed");
    }

    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userinfo = (await userinfoRes.json()) as { email?: string };
    const email = userinfo.email ?? "";

    const expiresAt = tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null;

    const [existing] = await db.select().from(settingsTable).limit(1);
    if (existing) {
      await db
        .update(settingsTable)
        .set({
          googleEmail: email,
          googleAccessToken: tokenData.access_token,
          googleRefreshToken: tokenData.refresh_token ?? null,
          googleTokenExpiry: expiresAt,
          imapHost: "imap.gmail.com",
          imapPort: "993",
          imapEmail: email,
        })
        .where(eq(settingsTable.id, existing.id));
    }

    res.send(closePopupHtml(redirectOrigin, { type: "google_auth_success", email }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.send(closePopupHtml(redirectOrigin, { type: "google_auth_error", error: msg }));
  }
});

export default router;
