import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh if < 5 min remaining

/**
 * Pure helper — returns true when the stored token should be refreshed.
 * Exported so it can be unit-tested without a database dependency.
 */
export function tokenNeedsRefresh(expiryIso: string | null | undefined): boolean {
  const expiresAt = expiryIso ? new Date(expiryIso).getTime() : 0;
  return Date.now() + REFRESH_BUFFER_MS >= expiresAt;
}

/**
 * Pure helper — calls Google's token endpoint and returns the new access token
 * and expiry.  Accepts an optional `fetchFn` for testing.
 * Exported so it can be unit-tested without a database dependency.
 *
 * Returns null when the request fails or the response is missing an access_token.
 */
export async function callRefreshEndpoint(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ accessToken: string; newExpiry: string } | null> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  try {
    const res = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await res.json() as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!res.ok || !data.access_token) return null;

    const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
    return { accessToken: data.access_token, newExpiry };
  } catch {
    return null;
  }
}

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

  if (!tokenNeedsRefresh(settings.googleTokenExpiry)) {
    return settings.googleAccessToken;
  }

  if (!settings.googleRefreshToken) return null;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const result = await callRefreshEndpoint(settings.googleRefreshToken, clientId, clientSecret);
  if (!result) return null;

  await db
    .update(settingsTable)
    .set({ googleAccessToken: result.accessToken, googleTokenExpiry: result.newExpiry })
    .where(eq(settingsTable.id, settingsId));

  return result.accessToken;
}
