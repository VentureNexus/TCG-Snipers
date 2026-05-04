import { useEffect, useRef, useState } from "react";

interface ApiFailure {
  reason: string;
}

const HEALTH_PROBE_DELAY_MS = 10_000;
const HEALTH_PROBE_INTERVAL_MS = 30_000;

export function DbErrorBanner() {
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [logs, setLogs] = useState<string[] | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const diag = window.electronAPI?.diagnostics;
    if (!diag) return;

    let cancelled = false;

    void (async () => {
      const status = await diag.getStartStatus();
      if (!cancelled && !status.ok && status.reason) {
        setFailure({ reason: status.reason });
      }
    })();

    const offFailed = diag.onStartFailed((info) => {
      if (!cancelled) setFailure({ reason: info.reason });
    });

    const offCrashed = diag.onCrashed((info) => {
      if (!cancelled) setFailure({ reason: info.reason });
    });

    const offRecovered = diag.onRecovered(() => {
      if (!cancelled) setFailure(null);
    });

    const startPolling = () => {
      probeIntervalRef.current = setInterval(async () => {
        if (cancelled) return;
        const health = await diag.getHealth();
        if (!cancelled && !health.alive) {
          setFailure((prev) =>
            prev ?? { reason: "The database process stopped unexpectedly." }
          );
        } else if (!cancelled && health.alive) {
          setFailure((prev) => {
            if (prev?.reason === "The database process stopped unexpectedly.") return null;
            return prev;
          });
        }
      }, HEALTH_PROBE_INTERVAL_MS);
    };

    probeTimerRef.current = setTimeout(() => {
      if (!cancelled) startPolling();
    }, HEALTH_PROBE_DELAY_MS);

    return () => {
      cancelled = true;
      offFailed();
      offCrashed();
      offRecovered();
      if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
      if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    };
  }, []);

  const handleViewLogs = async () => {
    if (!window.electronAPI?.diagnostics) return;
    const lines = await window.electronAPI.diagnostics.getLogs();
    setLogs(lines);
    setShowLogs(true);
  };

  const handleOpenLogFile = () => {
    window.electronAPI?.diagnostics?.openLogFile?.();
  };

  if (!failure) return null;

  return (
    <>
      <div
        role="alert"
        data-testid="db-error-banner"
        className="flex flex-col gap-1 px-4 py-2.5 text-sm border-b bg-destructive/15 border-destructive/40 text-foreground"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-destructive">API startup failed</span>
          <span className="text-muted-foreground flex-1 truncate">
            {failure.reason}
          </span>
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleViewLogs}
              className="border border-destructive/40 text-destructive rounded-md px-3 py-1.5 font-semibold hover:bg-destructive/10 transition text-xs"
            >
              View Logs
            </button>
            {window.electronAPI?.diagnostics?.openLogFile && (
              <button
                type="button"
                onClick={handleOpenLogFile}
                className="border border-destructive/40 text-destructive rounded-md px-3 py-1.5 font-semibold hover:bg-destructive/10 transition text-xs"
              >
                Open Log File
              </button>
            )}
            <a
              href="https://discord.gg/tcgsnipers"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                void window.electronAPI?.openExternal("https://discord.gg/tcgsnipers");
              }}
              className="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 font-semibold hover:opacity-90 transition text-xs"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>

      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-background border border-border rounded-lg shadow-xl w-[700px] max-w-[90vw] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">API Server Logs</span>
              <div className="flex items-center gap-2">
                {window.electronAPI?.diagnostics?.openLogFile && (
                  <button
                    type="button"
                    onClick={handleOpenLogFile}
                    className="text-muted-foreground hover:text-foreground transition text-xs border border-border/50 rounded px-2 py-1"
                  >
                    Open in text editor
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowLogs(false)}
                  className="text-muted-foreground hover:text-foreground transition text-xs px-2 py-1"
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
              {logs && logs.length > 0
                ? logs.join("\n")
                : "No log entries captured."}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
