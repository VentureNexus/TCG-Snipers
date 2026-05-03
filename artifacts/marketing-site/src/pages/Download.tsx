import { useState } from "react";
import { Link } from "wouter";
import { licenseApi } from "@/lib/api";

const SESSION_KEY = "tcgsnipers_portal_session";

type Os = "win" | "mac" | "linux";

// Programmatically trigger a download without navigating the current page.
// For cross-origin URLs the browser ignores the `download` attribute, but
// the response's Content-Disposition: attachment header (set by both the
// License API streaming endpoint and GitHub Release asset URLs) forces a
// download regardless. The hidden anchor avoids the URL-bar flash you get
// from window.location.href.
function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const OPTIONS: { os: Os; label: string; sub: string }[] = [
  { os: "win", label: "Windows", sub: "Setup .exe (NSIS)" },
  { os: "mac", label: "macOS", sub: "DMG (Intel + Apple Silicon)" },
  { os: "linux", label: "Linux", sub: "AppImage" },
];

export default function Download() {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function startDownload(os: Os) {
    setError(null);
    setInfo(null);
    const session = sessionStorage.getItem(SESSION_KEY);
    if (!session) {
      setError("Sign in via the manage-license portal first to download the installer.");
      return;
    }
    setLoading(os);
    try {
      const result = await licenseApi.installerDownload(session, os);
      if (result.comingSoon) {
        setInfo(result.message ?? "This installer is coming soon.");
      } else if (result.url) {
        triggerDownload(result.url);
      } else {
        setError("Could not start download.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start download");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Download TCG Snipers</h1>
      <p className="text-muted-foreground mb-8">
        Choose your operating system. You'll need an active subscription to download the installer.
      </p>
      <div className="grid sm:grid-cols-3 gap-4">
        {OPTIONS.map((o) => (
          <button
            key={o.os}
            onClick={() => startDownload(o.os)}
            disabled={loading !== null}
            className="bg-card border border-border rounded-xl p-6 text-left hover:border-primary transition disabled:opacity-50"
          >
            <div className="font-semibold text-lg">{o.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{o.sub}</div>
            <div className="text-primary text-sm mt-4">
              {loading === o.os ? "Preparing…" : "Download →"}
            </div>
          </button>
        ))}
      </div>
      {info && (
        <div className="mt-6 bg-card border border-primary/40 rounded-lg p-4 text-sm">
          <p className="text-foreground">{info}</p>
        </div>
      )}
      {error && (
        <div className="mt-6 bg-card border border-destructive/40 rounded-lg p-4 text-sm">
          <p className="text-destructive">{error}</p>
          <Link href="/manage" className="text-primary underline mt-2 inline-block">
            Open the manage-license portal
          </Link>
        </div>
      )}
    </div>
  );
}
