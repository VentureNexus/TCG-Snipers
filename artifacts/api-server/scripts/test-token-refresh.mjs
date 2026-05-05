/**
 * test-token-refresh.mjs
 *
 * Unit tests for the Google OAuth token refresh logic.
 *
 * Tests the pure helpers exported from googleTokenManager.ts without
 * needing a database connection or real HTTP calls.
 *
 * Usage:
 *   node artifacts/api-server/scripts/test-token-refresh.mjs
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more tests failed
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline the pure logic so this test runs without building TypeScript first.
// These functions mirror googleTokenManager.ts exactly; if you change the
// production logic, update these as well.
// ---------------------------------------------------------------------------

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function tokenNeedsRefresh(expiryMs) {
  const expiresAt = (expiryMs != null && !isNaN(expiryMs)) ? expiryMs : 0;
  return Date.now() + REFRESH_BUFFER_MS >= expiresAt;
}

async function callRefreshEndpoint(refreshToken, clientId, clientSecret, fetchFn) {
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

    const data = await res.json();

    if (!res.ok || !data.access_token) return null;

    const newExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    return { accessToken: data.access_token, newExpiry };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// tokenNeedsRefresh tests
// ---------------------------------------------------------------------------

test("tokenNeedsRefresh: null expiry → needs refresh", () => {
  assert.equal(tokenNeedsRefresh(null), true);
});

test("tokenNeedsRefresh: undefined expiry → needs refresh", () => {
  assert.equal(tokenNeedsRefresh(undefined), true);
});

test("tokenNeedsRefresh: already expired → needs refresh", () => {
  assert.equal(tokenNeedsRefresh(Date.now() - 1000), true);
});

test("tokenNeedsRefresh: expiry exactly at now → needs refresh", () => {
  assert.equal(tokenNeedsRefresh(Date.now()), true);
});

test("tokenNeedsRefresh: expiry 4 min 59 s from now (within 5-min buffer) → needs refresh", () => {
  assert.equal(tokenNeedsRefresh(Date.now() + 4 * 60 * 1000 + 59 * 1000), true);
});

test("tokenNeedsRefresh: expiry exactly 5 min from now (edge of buffer) → needs refresh", () => {
  assert.equal(tokenNeedsRefresh(Date.now() + REFRESH_BUFFER_MS), true);
});

test("tokenNeedsRefresh: expiry 5 min + 1 s from now → does NOT need refresh", () => {
  assert.equal(tokenNeedsRefresh(Date.now() + REFRESH_BUFFER_MS + 1000), false);
});

test("tokenNeedsRefresh: expiry 1 hour from now → does NOT need refresh", () => {
  assert.equal(tokenNeedsRefresh(Date.now() + 60 * 60 * 1000), false);
});

test("tokenNeedsRefresh: NaN (legacy malformed value coerced to number) → needs refresh", () => {
  // Regression: before the bigint migration a malformed ISO string could be
  // coerced to NaN. NaN must be treated as epoch-0 so a refresh is triggered.
  assert.equal(tokenNeedsRefresh(NaN), true);
});

// ---------------------------------------------------------------------------
// callRefreshEndpoint tests
// ---------------------------------------------------------------------------

test("callRefreshEndpoint: successful response returns accessToken and newExpiry", async () => {
  const mockFetch = async (_url, _opts) => ({
    ok: true,
    json: async () => ({ access_token: "new-token-abc", expires_in: 3600 }),
  });

  const result = await callRefreshEndpoint("rt-123", "cid", "csecret", mockFetch);
  assert.ok(result, "expected a non-null result");
  assert.equal(result.accessToken, "new-token-abc");
  const nowMs = Date.now();
  assert.ok(result.newExpiry > nowMs + 3500 * 1000, "newExpiry should be ~1 hour from now");
  assert.ok(result.newExpiry < nowMs + 3700 * 1000, "newExpiry should not be excessively far");
});

test("callRefreshEndpoint: uses expires_in=3600 as default when field is absent", async () => {
  const mockFetch = async (_url, _opts) => ({
    ok: true,
    json: async () => ({ access_token: "token-no-expiry" }),
  });

  const result = await callRefreshEndpoint("rt-x", "cid", "csecret", mockFetch);
  assert.ok(result);
  assert.ok(result.newExpiry > Date.now() + 3500 * 1000);
});

test("callRefreshEndpoint: HTTP error response returns null", async () => {
  const mockFetch = async () => ({
    ok: false,
    json: async () => ({ error: "invalid_grant" }),
  });

  const result = await callRefreshEndpoint("rt-bad", "cid", "csecret", mockFetch);
  assert.equal(result, null);
});

test("callRefreshEndpoint: response missing access_token returns null", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ expires_in: 3600 }),
  });

  const result = await callRefreshEndpoint("rt-y", "cid", "csecret", mockFetch);
  assert.equal(result, null);
});

test("callRefreshEndpoint: fetch throws returns null (network error)", async () => {
  const mockFetch = async () => { throw new Error("Network error"); };

  const result = await callRefreshEndpoint("rt-z", "cid", "csecret", mockFetch);
  assert.equal(result, null);
});

test("callRefreshEndpoint: sends correct POST body fields", async () => {
  let capturedBody = null;
  const mockFetch = async (_url, opts) => {
    capturedBody = new URLSearchParams(opts.body);
    return { ok: true, json: async () => ({ access_token: "tok", expires_in: 3600 }) };
  };

  await callRefreshEndpoint("my-refresh-token", "my-client-id", "my-secret", mockFetch);

  assert.equal(capturedBody.get("grant_type"), "refresh_token");
  assert.equal(capturedBody.get("refresh_token"), "my-refresh-token");
  assert.equal(capturedBody.get("client_id"), "my-client-id");
  assert.equal(capturedBody.get("client_secret"), "my-secret");
});
