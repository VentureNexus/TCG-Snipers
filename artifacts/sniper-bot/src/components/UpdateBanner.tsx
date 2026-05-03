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

const DISMISS_KEY = "tcgsnipers_update_dismissed_for";

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const updates = window.electronAPI?.updates;
    if (!updates) return; // browser-only preview, no electron

    let cancelled = false;
    void (async () => {
      const cached = await updates.latest();
      if (!cancelled && cached) setInfo(cached);
      const fresh = await updates.check();
      if (!cancelled && fresh) setInfo(fresh);
    })();

    const off = updates.onAvailable((next) => {
      if (!cancelled) setInfo(next);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  useEffect(() => {
    if (!info) return;
    const last = localStorage.getItem(DISMISS_KEY);
    setDismissed(last === info.latest && !info.forceUpdate);
  }, [info]);

  if (!info || !info.updateAvailable) return null;
  if (dismissed && !info.forceUpdate) return null;

  const onDownload = () => {
    void window.electronAPI?.updates.openDownload();
  };
  const onDismiss = () => {
    localStorage.setItem(DISMISS_KEY, info.latest);
    setDismissed(true);
  };

  const isForced = info.forceUpdate;

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
          onClick={onDownload}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 font-semibold hover:opacity-90 transition text-xs"
        >
          Download update
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
