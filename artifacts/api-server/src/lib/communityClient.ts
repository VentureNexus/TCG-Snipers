/**
 * communityClient — anonymized push/pull for the shared community knowledge base.
 *
 * All operations are fire-and-forget or return empty defaults on failure.
 * If COMMUNITY_API_URL is not configured the feature is silently disabled.
 *
 * Data stored:
 *   nav_path       — retailer, stage, AI-discovered click sequence (no product URLs)
 *   captcha_solve  — retailer, captchaType, normalized click coords
 *   checkout_success — retailer, timing only
 *
 * Data never stored: addresses, emails, passwords, proxies, payment info.
 */

import { db, settingsTable } from "@workspace/db";

const COMMUNITY_API_URL = (process.env.COMMUNITY_API_URL ?? "").replace(/\/$/, "");

async function getLicenseToken(): Promise<string | null> {
  try {
    const [row] = await db
      .select({ licenseToken: settingsTable.licenseToken })
      .from(settingsTable)
      .limit(1);
    return row?.licenseToken ?? null;
  } catch {
    return null;
  }
}

export async function pushCommunityEvent(
  retailer: string,
  eventType: "nav_path" | "captcha_solve" | "checkout_success",
  data: Record<string, unknown>,
): Promise<void> {
  if (!COMMUNITY_API_URL) return;
  try {
    const token = await getLicenseToken();
    if (!token) return;
    await fetch(`${COMMUNITY_API_URL}/community/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ retailer, eventType, data }),
    });
  } catch {
    // Non-fatal — never block bot operations
  }
}

export interface CommunityNavAction {
  action: string;
  descriptor: string;
  waitMs?: number;
}

export async function pullCommunityNavPath(
  retailer: string,
  stage: string,
): Promise<CommunityNavAction[]> {
  if (!COMMUNITY_API_URL) return [];
  try {
    const token = await getLicenseToken();
    if (!token) return [];
    const url = new URL(`${COMMUNITY_API_URL}/community/events`);
    url.searchParams.set("retailer", retailer);
    url.searchParams.set("eventType", "nav_path");
    url.searchParams.set("stage", stage);
    url.searchParams.set("limit", "10");
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      events: Array<{ data: { actions: CommunityNavAction[] } }>;
    };
    return json.events[0]?.data?.actions ?? [];
  } catch {
    return [];
  }
}
