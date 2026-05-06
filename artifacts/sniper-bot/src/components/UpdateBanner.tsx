import { useEffect, useState } from "react";

interface UpdateInfo {
  current: string;
  latest: string;
  minSupported: string;
  updateAvailable: boolean;
  forceUpdate: boolean;
  downloadUrl: string;
  releaseNotesUrl: string;
  checkedAt: string;
}

interface DownloadedUpdate {
  version: string;
  releaseNotes?: string | null;
  releaseName?: string | null;
  releaseDate?: string;
}

interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

const DISMISS_KEY = "tcgsnipers_update_dismissed_for";

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [downloaded, setDownloaded] = useState<DownloadedUpdate | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const updates = window.electronAPI?.updates;
    if (!updates) return;

    let cancelled = false;
    void (async () => {
      const cached = await updates.latest();
      if (!cancelled && cached) setInfo(cached);
      const fresh = await updates.check();
      if (!cancelled && fresh) setInfo(fresh);
      const staged = await updates.downloaded();
      if (!cancelled && staged) setDownloaded(staged);
    })();

    const offAvail = updates.onAvailable((next) => {
      if (!cancelled) setInfo(next);
    });
    const offDone = updates.onDownloaded((next) => {
      if (!cancelled) {
        setDownloaded(next);
        setDownloading(false);
        setProgress(null);
      }
    });
    const offProg = updates.onProgress((p) => {
      if (!cancelled) {
        setProgress(p);
        if (p.percent > 0) setDownloading(false);
      }
    });
    return () => {
      cancelled = true;
      offAvail();
      offDone();
      offProg();
    };
  }, []);

  useEffect(() => {
    if (!info) return;
    const last = localStorage.getItem(DISMISS_KEY);
    setDismissed(last === info.latest && !info.forceUpdate);
  }, [info]);

  // ── Staged update ready: prompt restart ─────────────────────────────────
  if (downloaded) {
    const onRestart = async () => {
      setInstalling(true);
      try {
        await window.electronAPI?.updates.install();
      } catch {
        setInstalling(false);
      }
    };
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 text-sm border-b bg-primary/15 border-primary/40 text-foreground"
        data-testid="update-banner-ready"
      >
        <span className="font-semibold">Update ready</span>
        <span className="text-muted-foreground">
          v{downloaded.version} downloaded — restart to apply.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onRestart}
            disabled={installing}
            className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 font-semibold hover:opacity-90 transition text-xs disabled:opacity-60"
          >
            {installing ? "Restarting…" : "Restart to update"}
          </button>
        </div>
      </div>
    );
  }

  if (!info || !info.updateAvailable) return null;

  // ── In-progress download ─────────────────────────────────────────────────
  if (progress && progress.percent > 0 && progress.percent < 100) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 text-sm border-b bg-primary/10 border-primary/30 text-foreground"
        data-testid="update-banner-downloading"
      >
        <span className="font-semibold">Downloading update</span>
        <span className="text-muted-foreground">
          v{info.latest} — {Math.round(progress.percent)}%
        </span>
        <div className="ml-auto h-1.5 w-40 bg-primary/20 rounded overflow-hidden">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${Math.round(progress.percent)}%` }}
          />
        </div>
      </div>
    );
  }

  // ── Download started but no progress yet ────────────────────────────────
  if (downloading) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 text-sm border-b bg-primary/10 border-primary/30 text-foreground"
        data-testid="update-banner-starting"
      >
        <span className="font-semibold">Starting download…</span>
        <span className="text-muted-foreground">v{info.latest}</span>
        <div className="ml-auto h-1.5 w-40 bg-primary/20 rounded overflow-hidden">
          <div className="h-full bg-primary/50 animate-pulse w-full" />
        </div>
      </div>
    );
  }

  if (dismissed && !info.forceUpdate) return null;

  const isForced = info.forceUpdate;

  const onUpdateNow = async () => {
    const updates = window.electronAPI?.updates;
    if (!updates) return;
    setDownloading(true);
    const started = await updates.startDownload();
    if (!started) {
      // Fell back to browser download page — clear the downloading indicator
      setDownloading(false);
    }
  };

  const onDismiss = () => {
    localStorage.setItem(DISMISS_KEY, info.latest);
    setDismissed(true);
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 text-sm border-b ${
        isForced
          ? "bg-destructive/15 border-destructive/40 text-destructive-foreground"
          : "bg-primary/15 border-primary/40 text-foreground"
      }`}
      data-testid="update-banner"
    >
      <span className="font-semibold">
        {isForced ? "Update required" : "Update available"}
      </span>
      <span className="text-muted-foreground">
        v{info.latest} is out — you're on v{info.current}.
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onUpdateNow}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 font-semibold hover:opacity-90 transition text-xs"
        >
          Update now
        </button>
        {!isForced && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground transition text-xs px-2"
          >
            Later
          </button>
        )}
      </div>
    </div>
  );
}
