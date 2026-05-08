import { useState, useEffect, useRef, useCallback } from "react";
import { useListTasks, getListTasksQueryKey } from "@workspace/api-client-react";
import { getApiBase } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, MousePointer, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";

export function CaptchaAssistModal() {
  const { data: tasks = [] } = useListTasks(undefined, {
    query: { refetchInterval: 2000, queryKey: getListTasksQueryKey() },
  });

  const assistTask = tasks.find((t) => t.status === "awaiting_user_captcha") ?? null;
  const taskId = assistTask?.id ?? null;

  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [clickFeedback, setClickFeedback] = useState<{ x: number; y: number } | null>(null);
  const [signalled, setSignalled] = useState(false);

  // Browser toolbar
  const [currentUrl, setCurrentUrl] = useState("");
  const [addressBarValue, setAddressBarValue] = useState("");
  const [addressBarFocused, setAddressBarFocused] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollUrlRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevObjectUrl = useRef<string | null>(null);
  const mouseDownPos = useRef<{ nx: number; ny: number } | null>(null);
  const apiBase = getApiBase();

  const fetchScreenshot = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`${apiBase}/api/captcha-assist/${id}/screenshot`, { cache: "no-store" });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (prevObjectUrl.current) URL.revokeObjectURL(prevObjectUrl.current);
        prevObjectUrl.current = url;
        setScreenshotSrc(url);
      } catch { /* ignore */ }
    },
    [apiBase],
  );

  const fetchUrl = useCallback(async (id: number) => {
    try {
      const res = await fetch(`${apiBase}/api/captcha-assist/${id}/url`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { url: string };
      if (data.url) {
        setCurrentUrl(data.url);
        setAddressBarValue((prev) => addressBarFocused ? prev : data.url);
      }
    } catch { /* ignore */ }
  }, [apiBase, addressBarFocused]);

  useEffect(() => {
    if (!taskId) {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollUrlRef.current) clearInterval(pollUrlRef.current);
      setScreenshotSrc(null);
      setSignalled(false);
      setCurrentUrl("");
      setAddressBarValue("");
      return;
    }
    fetchScreenshot(taskId);
    fetchUrl(taskId);
    pollRef.current = setInterval(() => fetchScreenshot(taskId), 150);
    pollUrlRef.current = setInterval(() => fetchUrl(taskId), 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollUrlRef.current) clearInterval(pollUrlRef.current);
    };
  }, [taskId, fetchScreenshot, fetchUrl]);

  // ── Browser toolbar ────────────────────────────────────────────────────

  const handleBack = () => {
    if (!taskId || signalled) return;
    fetch(`${apiBase}/api/captcha-assist/${taskId}/back`, { method: "POST" }).catch(() => {});
  };

  const handleForward = () => {
    if (!taskId || signalled) return;
    fetch(`${apiBase}/api/captcha-assist/${taskId}/forward`, { method: "POST" }).catch(() => {});
  };

  const handleReload = () => {
    if (!taskId || signalled) return;
    fetch(`${apiBase}/api/captcha-assist/${taskId}/reload`, { method: "POST" }).catch(() => {});
  };

  const handleNavigate = async (url: string) => {
    if (!taskId || signalled || !url.trim()) return;
    setNavigating(true);
    try {
      await fetch(`${apiBase}/api/captcha-assist/${taskId}/navigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
    } catch { /* ignore */ } finally {
      setNavigating(false);
    }
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleNavigate(addressBarValue);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setAddressBarValue(currentUrl);
      (e.target as HTMLInputElement).blur();
    }
  };

  // ── Mouse relay ────────────────────────────────────────────────────────

  function getNormalized(e: React.MouseEvent<HTMLImageElement>): { nx: number; ny: number } | null {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { nx, ny };
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!taskId || signalled) return;
    e.preventDefault();
    const pos = getNormalized(e);
    if (!pos) return;
    mouseDownPos.current = pos;
    setClickFeedback({ x: e.clientX - imgRef.current!.getBoundingClientRect().left, y: e.clientY - imgRef.current!.getBoundingClientRect().top });
    fetch(`${apiBase}/api/captcha-assist/${taskId}/mousedown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normalizedX: pos.nx, normalizedY: pos.ny }),
    }).catch(() => {});
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!taskId || signalled) return;
    e.preventDefault();
    setTimeout(() => setClickFeedback(null), 600);
    const pos = getNormalized(e);
    if (!pos) return;
    mouseDownPos.current = null;
    fetch(`${apiBase}/api/captcha-assist/${taskId}/mouseup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normalizedX: pos.nx, normalizedY: pos.ny }),
    }).catch(() => {});
  };

  const handleWheel = async (e: React.WheelEvent<HTMLImageElement>) => {
    if (!taskId || signalled || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    try {
      await fetch(`${apiBase}/api/captcha-assist/${taskId}/scroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizedX: nx, normalizedY: ny, deltaX: e.deltaX, deltaY: e.deltaY }),
      });
    } catch { /* ignore */ }
  };

  const handleDone = async () => {
    if (!taskId || signalled) return;
    setSignalled(true);
    try { await fetch(`${apiBase}/api/captcha-assist/${taskId}/done`, { method: "POST" }); } catch { /* ignore */ }
  };

  const handleGiveUp = async () => {
    if (!taskId || signalled) return;
    setSignalled(true);
    try { await fetch(`${apiBase}/api/captcha-assist/${taskId}/give-up`, { method: "POST" }); } catch { /* ignore */ }
  };

  if (!assistTask) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-3xl mx-4 rounded-xl border border-amber-500/40 bg-zinc-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 bg-amber-500/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse block" />
            <span className="text-sm font-semibold text-amber-300">CAPTCHA Human Assist</span>
            <span className="text-xs text-muted-foreground">
              Task #{assistTask.id} · {assistTask.retailer}
            </span>
          </div>
        </div>

        {/* Browser toolbar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/30 bg-zinc-950/60 shrink-0">
          <button
            type="button"
            onClick={handleBack}
            disabled={signalled}
            className="flex items-center justify-center h-7 w-7 rounded hover:bg-zinc-800 text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
            title="Back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleForward}
            disabled={signalled}
            className="flex items-center justify-center h-7 w-7 rounded hover:bg-zinc-800 text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
            title="Forward"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleReload}
            disabled={signalled || navigating}
            className="flex items-center justify-center h-7 w-7 rounded hover:bg-zinc-800 text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
            title="Reload"
          >
            <RotateCw className={`w-3.5 h-3.5 ${navigating ? "animate-spin" : ""}`} />
          </button>
          <div className="flex-1 mx-1">
            <input
              type="text"
              value={addressBarFocused ? addressBarValue : (currentUrl || addressBarValue)}
              onChange={(e) => setAddressBarValue(e.target.value)}
              onFocus={() => { setAddressBarFocused(true); setAddressBarValue(currentUrl); }}
              onBlur={() => setAddressBarFocused(false)}
              onKeyDown={handleAddressKeyDown}
              disabled={signalled}
              placeholder="Enter URL and press Enter…"
              className="w-full h-7 rounded-md border border-border/50 bg-zinc-900 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition disabled:opacity-40"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="px-5 pt-2.5 pb-1.5 shrink-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The bot couldn't auto-solve this CAPTCHA.{" "}
            <strong className="text-foreground">Click directly on the image</strong> to interact
            with the live browser — tick checkboxes, select tiles, press buttons. For{" "}
            <strong className="text-foreground">press-and-hold</strong> challenges, hold your mouse
            button down on the image. When done, click{" "}
            <strong className="text-emerald-400">I'm Done</strong>.
          </p>
        </div>

        {/* Screenshot */}
        <div className="px-5 pb-3 flex-1 min-h-0 overflow-hidden">
          <div
            className="relative rounded-lg overflow-hidden border border-border/30 bg-black select-none"
            style={{ minHeight: 200, cursor: "crosshair" }}
          >
            {screenshotSrc ? (
              <>
                <img
                  ref={imgRef}
                  src={screenshotSrc}
                  alt="Live browser view"
                  className="w-full object-contain"
                  onMouseDown={handleMouseDown}
                  onMouseUp={handleMouseUp}
                  onWheel={handleWheel}
                  draggable={false}
                  style={{ userSelect: "none", WebkitUserSelect: "none" }}
                />
                {clickFeedback && (
                  <div
                    className="absolute pointer-events-none"
                    style={{ left: clickFeedback.x, top: clickFeedback.y, transform: "translate(-50%,-50%)" }}
                  >
                    <div className="h-7 w-7 rounded-full border-2 border-amber-400 bg-amber-400/25 animate-ping" />
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                Loading browser view…
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground text-center">
            <MousePointer className="inline w-3 h-3 mr-1 -mt-0.5" />
            Click or hold to interact · Scroll to scroll the page
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-border/40 bg-zinc-950/40 shrink-0">
          <Button
            onClick={handleDone}
            disabled={signalled}
            className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle className="w-4 h-4" />
            I'm Done — Continue Bot
          </Button>
          <Button
            variant="outline"
            onClick={handleGiveUp}
            disabled={signalled}
            className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10"
          >
            <XCircle className="w-4 h-4" />
            Give Up — Pause Task
          </Button>
        </div>

        {signalled && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm rounded-xl">
            <div className="text-center space-y-3">
              <div className="h-9 w-9 rounded-full border-4 border-amber-400 border-t-transparent animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Checking CAPTCHA status…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
