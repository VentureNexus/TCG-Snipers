export const LICENSE_API_URL: string =
  (import.meta.env.VITE_LICENSE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export interface ApiError {
  error: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LICENSE_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as ApiError;
      if (body?.error) msg = body.error;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const licenseApi = {
  startCheckout(email: string, origin: string): Promise<{ url: string; sessionId: string }> {
    return request("/license/checkout", {
      method: "POST",
      body: JSON.stringify({
        email: email || undefined,
        successUrl: `${origin}/marketing/success`,
        cancelUrl: `${origin}/marketing/cancel`,
      }),
    });
  },
  requestMagicLink(email: string): Promise<{ ok: true }> {
    return request("/license/portal/request-magic-link", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  verifyMagicToken(token: string): Promise<{ session: string; email: string }> {
    return request(`/license/portal/verify?token=${encodeURIComponent(token)}`);
  },
  me(session: string): Promise<{
    email: string;
    license: { id: number; status: string; keyLast4: string; currentPeriodEnd: string | null } | null;
    device: {
      id: number;
      osPlatform: string;
      label: string;
      activatedAt: string;
      lastSeenAt: string;
    } | null;
  }> {
    return request("/license/portal/me", { headers: { Authorization: `Bearer ${session}` } });
  },
  deactivateDevice(session: string): Promise<{ ok: true }> {
    return request("/license/portal/deactivate-device", {
      method: "POST",
      headers: { Authorization: `Bearer ${session}` },
    });
  },
  openStripePortal(session: string): Promise<{ url: string }> {
    return request("/license/portal/stripe-portal", {
      method: "POST",
      headers: { Authorization: `Bearer ${session}` },
    });
  },
  installerDownload(session: string, os: "win" | "mac" | "linux"): Promise<{ url: string; os: string }> {
    return request(`/license/download/installer?os=${os}`, {
      headers: { Authorization: `Bearer ${session}` },
    });
  },
};
