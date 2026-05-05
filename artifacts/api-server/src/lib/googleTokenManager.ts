import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh if < 5 min remaining

/**
 * Returns a valid Gmail access token for use with XOAUTH2.
 * If the stored token is expired (or within 5 min of expiry),
 * it is refreshed using the stored refresh token and the new
 * access token + expiry are persisted back to settings.
 *
 * Returns null when:
 *  - No Google credentials are stored in settings
 *  - No refresh token is available and the access token is expired
 *  - The refresh attempt fails
 */
export async function getFreshGoogleAccessToken(settingsId: number): Promise<string | null> {
  const [settings] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, settingsId))
    .limit(1);

  if (!settings?.googleAccessToken) return null;

  const expiresAt = settings.googleTokenExpiry ? new Date(settings.googleTokenExpiry).getTime() : 0;
  const isExpired = Date.now() + REFRESH_BUFFER_MS >= expiresAt;

  if (!isExpired) {
    return settings.googleAccessToken;
  }

  if (!settings.googleRefreshToken) {
    return null;
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: settings.googleRefreshToken,
      grant_type: "refresh_token",
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await res.json() as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!res.ok || !data.access_token) {
      return null;
    }

    const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();

    await db
      .update(settingsTable)
      .set({
        googleAccessToken: data.access_token,
        googleTokenExpiry: newExpiry,
      })
      .where(eq(settingsTable.id, settingsId));

    return data.access_token;
  } catch {
    return null;
  }
}
