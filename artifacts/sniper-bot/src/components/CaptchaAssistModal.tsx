import { useState, useEffect, useRef, useCallback } from "react";
import { useListTasks, getListTasksQueryKey } from "@workspace/api-client-react";
import { getApiBase } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, MousePointer } from "lucide-react";

export function CaptchaAssistModal() {
  const { data: tasks = [] } = useListTasks(undefined, { query: { refetchInterval: 2000, queryKey: getListTasksQueryKey() } });

  const assistTask = tasks.find((t) => t.status === "awaiting_user_captcha") ?? null;
  const taskId = assistTask?.id ?? null;

  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [clickFeedback, setClickFeedback] = useState<{ x: number; y: number } | null>(null);
  const [signalled, setSignalled] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevObjectUrl = useRef<string | null>(null);
  const apiBase = getApiBase();

  const fetchScreenshot = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`${apiBase}/api/captcha-assist/${id}/screenshot`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (prevObjectUrl.current) URL.revokeObjectURL(prevObjectUrl.current);
        prevObjectUrl.current = url;
        setScreenshotSrc(url);
      } catch {
        // ignore transient errors
      }
    },
    [apiBase],
  );

  useEffect(() => {
    if (!taskId) {
      if (pollRef.current) clearInterval(pollRef.current);
      setScreenshotSrc(null);
      setSignalled(false);
      return;
    }
    fetchScreenshot(taskId);
    pollRef.current = setInterval(() => fetchScreenshot(taskId), 1200);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [taskId, fetchScreenshot]);

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!taskId || !imgRef.current || signalled) return;
    const rect = imgRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setClickFeedback({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setClickFeedback(null), 700);
    try {
      await fetch(`${apiBase}/api/captcha-assist/${taskId}/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizedX: nx, normalizedY: ny }),
      });
    } catch { /* ignore */ }
  };

  const handleDone = async () => {
    if (!taskId || signalled) return;
    setSignalled(true);
    try {
      await fetch(`${apiBase}/api/captcha-assist/${taskId}/done`, { method: "POST" });
    } catch { /* ignore */ }
  };

  const handleGiveUp = async () => {
    if (!taskId || signalled) return;
    setSignalled(true);
    try {
      await fetch(`${apiBase}/api/captcha-assist/${taskId}/give-up`, { method: "POST" });
    } catch { /* ignore */ }
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

        {/* Instructions */}
        <div className="px-5 pt-3 pb-2 shrink-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The bot couldn't auto-solve this CAPTCHA.{" "}
            <strong className="text-foreground">Click directly on the image</strong> to interact
            with the live browser — tick checkboxes, select tiles, press buttons. When you've solved
            it, click{" "}
            <strong className="text-emerald-400">I'm Done</strong>.
          </p>
        </div>

        {/* Screenshot */}
        <div className="px-5 pb-3 flex-1 min-h-0 overflow-hidden">
          <div
            className="relative rounded-lg overflow-hidden border border-border/30 bg-black cursor-crosshair select-none"
            style={{ minHeight: 200 }}
          >
            {screenshotSrc ? (
              <>
                <img
                  ref={imgRef}
                  src={screenshotSrc}
                  alt="Live browser view"
                  className="w-full object-contain"
                  onClick={handleImageClick}
                  draggable={false}
                />
                {clickFeedback && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: clickFeedback.x,
                      top: clickFeedback.y,
                      transform: "translate(-50%,-50%)",
                    }}
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
            Refreshes every ~1 s · Click anywhere in the image to interact with the page
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

        {/* Overlay shown while waiting for the bot to re-check after user signals done */}
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
