import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  clearStoredLicense,
  getFingerprint,
  licenseApi,
  loadStoredLicense,
  saveStoredLicense,
} from "@/lib/license";
import { getApiBase } from "@/lib/api-base";

interface LicenseContextValue {
  email: string | null;
  status: string | null;
  signOut: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);
export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used inside <LicenseGate>");
  return ctx;
}

type GateState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "active"; email: string; status: string }
  | { kind: "blocked"; email: string; status: string; reason: string };

const HEARTBEAT_MS = 5 * 60 * 1000;
const PORTAL_URL =
  (import.meta.env.VITE_MARKETING_SITE_URL as string | undefined) ?? "https://tcgsnipers.com";

const DEV_BYPASS_KEY = "tcgsnipers_dev_bypass";
const isDevPreview = import.meta.env.DEV && !window.electronAPI?.license;

async function stopAllTasks(): Promise<void> {
  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/tasks/stop-all`, { method: "POST" });
    if (!res.ok) {
      console.warn(`[LicenseGate] stop-all returned HTTP ${res.status} — tasks may still be running`);
    }
  } catch (err) {
    // Non-fatal — UI transition must not be blocked by this
    console.warn("[LicenseGate] stop-all request failed:", err);
  }
}

export function LicenseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "loading" });
  const fingerprintRef = useRef<{ fingerprint: string; osPlatform: string } | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function bootstrap() {
      if (isDevPreview && localStorage.getItem(DEV_BYPASS_KEY)) {
        if (alive) setState({ kind: "active", email: "dev@preview.local", status: "active" });
        return;
      }
      const fp = await getFingerprint();
      fingerprintRef.current = fp;
      const stored = await loadStoredLicense();
      if (!stored) {
        if (alive) setState({ kind: "signed-out" });
        return;
      }
      try {
        const r = await licenseApi.heartbeat({ token: stored.token, fingerprint: fp.fingerprint });
        if (!alive) return;
        if (r.status === "active") {
          setState({ kind: "active", email: stored.email, status: r.status });
        } else {
          await stopAllTasks();
          if (!alive) return;
          setState({
            kind: "blocked",
            email: stored.email,
            status: r.status,
            reason:
              r.status === "past_due"
                ? "Your subscription is past due. Update your payment method to resume sniping."
                : `Your license is ${r.status}.`,
          });
        }
      } catch (err) {
        if (!alive) return;
        const e = err as { status?: number; message?: string };
        if (e.status === 401 || e.status === 409) {
          // Token invalid or device mismatch — force sign out.
          await clearStoredLicense();
          setState({ kind: "signed-out" });
        } else {
          setState({
            kind: "blocked",
            email: stored.email,
            status: "unknown",
            reason: e.message ?? "Could not contact the license server.",
          });
        }
      }
    }

    bootstrap();
    timer = setInterval(() => {
      bootstrap();
    }, HEARTBEAT_MS);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  async function signOut() {
    if (isDevPreview) {
      localStorage.removeItem(DEV_BYPASS_KEY);
      setState({ kind: "signed-out" });
      return;
    }
    try {
      const stored = await loadStoredLicense();
      if (stored) {
        await licenseApi.deactivateDevice({ token: stored.token });
      }
    } catch {
      // Non-fatal — always clear local storage so user is not stuck
    }
    await clearStoredLicense();
    setState({ kind: "signed-out" });
  }

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Verifying license…
      </div>
    );
  }

  if (state.kind === "signed-out") {
    return (
      <SignInScreen
        onSignedIn={(email, status) => setState({ kind: "active", email, status })}
        getFingerprint={async () => fingerprintRef.current ?? (await getFingerprint())}
      />
    );
  }

  if (state.kind === "blocked") {
    return (
      <SubscriptionBlockedScreen
        email={state.email}
        reason={state.reason}
        status={state.status}
        onSignOut={signOut}
      />
    );
  }

  return (
    <LicenseContext.Provider value={{ email: state.email, status: state.status, signOut }}>
      {children}
    </LicenseContext.Provider>
  );
}

function SignInScreen({
  onSignedIn,
  getFingerprint: getFp,
}: {
  onSignedIn: (email: string, status: string) => void;
  getFingerprint: () => Promise<{ fingerprint: string; osPlatform: string }>;
}) {
  const [email, setEmail] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fp = await getFp();
      const r = await licenseApi.activate({
        email,
        licenseKey,
        fingerprint: fp.fingerprint,
        osPlatform: fp.osPlatform,
      });
      await saveStoredLicense({ token: r.token, email });
      onSignedIn(email, r.status);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e.status === 409) {
        setError("This license is already active on another device. In the dev preview, use \"Dev preview — skip license check\" below instead.");
      } else {
        setError(e.message ?? "Could not activate license");
      }
    } finally {
      setBusy(false);
    }
  }

  function openPortal() {
    if (window.electronAPI?.openExternal) {
      void window.electronAPI.openExternal(`${PORTAL_URL}/manage`);
    } else {
      window.open(`${PORTAL_URL}/manage`, "_blank");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold mb-1">
          <span className="text-primary">TCG</span> Snipers
        </h1>
        <p className="text-sm text-muted-foreground mb-6">Activate this device with your license.</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="w-full bg-input/50 border border-border rounded-md px-3 py-2 outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">License key</label>
            <input
              type="text"
              required
              value={licenseKey}
              onChange={(ev) => setLicenseKey(ev.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX"
              className="w-full bg-input/50 border border-border rounded-md px-3 py-2 outline-none focus:border-primary font-mono text-sm"
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-primary text-primary-foreground rounded-md py-2 font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {busy ? "Activating…" : "Activate"}
          </button>
        </form>
        <div className="mt-6 pt-6 border-t border-border text-xs text-muted-foreground space-y-1">
          <p>
            Don't have a license?{" "}
            <button onClick={openPortal} className="text-primary underline">
              Subscribe
            </button>
          </p>
          <p>
            License already used on another device?{" "}
            <button onClick={openPortal} className="text-primary underline">
              Release it from the portal
            </button>
          </p>
        </div>
        {isDevPreview && (
          <div className="mt-4 pt-4 border-t border-border/40">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(DEV_BYPASS_KEY, "1");
                onSignedIn("dev@preview.local", "active");
              }}
              className="w-full border border-border/50 rounded-md py-2 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:border-border transition"
            >
              Dev preview — skip license check
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubscriptionBlockedScreen({
  email,
  reason,
  status,
  onSignOut,
}: {
  email: string;
  reason: string;
  status: string;
  onSignOut: () => void;
}) {
  function openPortal() {
    if (window.electronAPI?.openExternal) {
      void window.electronAPI.openExternal(`${PORTAL_URL}/manage`);
    } else {
      window.open(`${PORTAL_URL}/manage`, "_blank");
    }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-md bg-card border border-destructive/40 rounded-2xl p-8">
        <h1 className="text-2xl font-bold mb-2">Subscription paused</h1>
        <p className="text-muted-foreground text-sm mb-1">{email}</p>
        <p className="text-xs uppercase tracking-wide text-destructive font-semibold mb-4">{status}</p>
        <p className="mb-6">{reason}</p>
        <div className="space-y-2">
          <button
            onClick={openPortal}
            className="w-full bg-primary text-primary-foreground rounded-md py-2 font-semibold"
          >
            Open billing portal
          </button>
          <button
            onClick={onSignOut}
            className="w-full border border-border rounded-md py-2 font-semibold hover:bg-secondary"
          >
            Sign out of this device
          </button>
        </div>
      </div>
    </div>
  );
}
