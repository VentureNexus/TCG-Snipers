import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { licenseApi } from "@/lib/api";

interface Me {
  email: string;
  license: { id: number; status: string; keyLast4: string; currentPeriodEnd: string | null } | null;
  device: { id: number; osPlatform: string; label: string; activatedAt: string; lastSeenAt: string } | null;
}

const SESSION_KEY = "tcgsnipers_portal_session";

export default function ManageSession() {
  const [, setLocation] = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenInUrl = params.get("token");
    let cancelled = false;

    async function bootstrap() {
      try {
        let session = sessionStorage.getItem(SESSION_KEY) ?? "";
        if (tokenInUrl) {
          const r = await licenseApi.verifyMagicToken(tokenInUrl);
          session = r.session;
          sessionStorage.setItem(SESSION_KEY, session);
          // Strip the token from the URL so refreshes don't try to re-consume it.
          window.history.replaceState({}, "", window.location.pathname);
        }
        if (!session) {
          setLocation("/manage");
          return;
        }
        const data = await licenseApi.me(session);
        if (!cancelled) setMe(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your account");
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  async function deactivate() {
    const session = sessionStorage.getItem(SESSION_KEY);
    if (!session || !me) return;
    if (!confirm("Release this device? You'll need to sign in again on the desktop app.")) return;
    setBusy(true);
    try {
      await licenseApi.deactivateDevice(session);
      const data = await licenseApi.me(session);
      setMe(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not release device");
    } finally {
      setBusy(false);
    }
  }

  async function openBillingPortal() {
    const session = sessionStorage.getItem(SESSION_KEY);
    if (!session) return;
    setBusy(true);
    try {
      const { url } = await licenseApi.openStripePortal(session);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-6 py-24">
        <div className="bg-card border border-destructive/40 rounded-lg p-6">
          <h1 className="font-semibold text-destructive mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button
            className="text-primary text-sm underline"
            onClick={() => setLocation("/manage")}
          >
            Request a new magic link
          </button>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-muted-foreground text-center">Loading…</div>
    );
  }

  const statusColor =
    me.license?.status === "active"
      ? "text-primary"
      : me.license?.status === "past_due"
        ? "text-yellow-400"
        : "text-destructive";

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Your license</h1>
        <p className="text-muted-foreground mt-1">{me.email}</p>
      </div>

      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Subscription</h2>
        {me.license ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Status</div>
              <div className={`font-semibold uppercase ${statusColor}`}>{me.license.status}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Key</div>
              <div className="font-mono">•••• {me.license.keyLast4}</div>
            </div>
            <div className="col-span-2">
              <div className="text-muted-foreground">Renews</div>
              <div>
                {me.license.currentPeriodEnd
                  ? new Date(me.license.currentPeriodEnd).toLocaleString()
                  : "—"}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            We don't have an active license on file. Subscribe from the home page to get started.
          </p>
        )}
        {me.license && (
          <button
            onClick={openBillingPortal}
            disabled={busy}
            className="mt-6 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            Open Stripe billing portal
          </button>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Active device</h2>
        {me.device ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground">Platform</div>
              <div className="font-mono">{me.device.osPlatform || "unknown"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Activated</div>
              <div>{new Date(me.device.activatedAt).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Last seen</div>
              <div>{new Date(me.device.lastSeenAt).toLocaleString()}</div>
            </div>
            <button
              onClick={deactivate}
              disabled={busy}
              className="border border-destructive text-destructive rounded-md px-4 py-2 text-sm font-semibold hover:bg-destructive/10 transition disabled:opacity-50"
            >
              Release this device
            </button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No device is currently bound. Sign into the desktop app to activate.
          </p>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-2">Get the desktop app</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Download the latest installer for your operating system.
        </p>
        <button
          onClick={() => setLocation("/download")}
          className="bg-secondary text-foreground rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90 transition"
        >
          Go to downloads
        </button>
      </section>
    </div>
  );
}
