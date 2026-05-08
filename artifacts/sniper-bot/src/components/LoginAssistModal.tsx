import { useState, useEffect, useRef, useCallback } from "react";
import { getApiBase } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, MousePointer, Keyboard, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";

interface ActiveSession {
  id: string;
  retailer: string;
  isManual: boolean;
}

export function LoginAssistModal() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [clickFeedback, setClickFeedback] = useState<{ x: number; y: number } | null>(null);
  const [signalled, setSignalled] = useState(false);
  const [typeBuffer, setTypeBuffer] = useState("");

  // Browser toolbar
  const [currentUrl, setCurrentUrl] = useState("");
  const [addressBarValue, setAddressBarValue] = useState("");
  const [addressBarFocused, setAddressBarFocused] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const pollScreenshotRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollSessionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollUrlRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevObjectUrl = useRef<string | null>(null);
  const apiBase = getApiBase();

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/login-assist/active`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ActiveSession | null;
      setSession((prev) => {
        if (!data && prev) {
          setScreenshotSrc(null);
          setSignalled(false);
          setTypeBuffer("");
          setCurrentUrl("");
          setAddressBarValue("");
        }
        if (data && (!prev || prev.id !== data.id)) {
          setSignalled(false);
          setTypeBuffer("");
          setCurrentUrl("");
          setAddressBarValue("");
        }
        return data;
      });
    } catch { /* ignore */ }
  }, [apiBase]);

  const fetchScreenshot = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${apiBase}/api/login-assist/${id}/screenshot`, { cache: "no-store" });
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

  const fetchUrl = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${apiBase}/api/login-assist/${id}/url`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { url: string };
      if (data.url) {
        setCurrentUrl(data.url);
        setAddressBarValue((prev) => addressBarFocused ? prev : data.url);
      }
    } catch { /* ignore */ }
  }, [apiBase, addressBarFocused]);

  useEffect(() => {
    fetchSession();
    pollSessionRef.current = setInterval(fetchSession, 2000);
    return () => { if (pollSessionRef.current) clearInterval(pollSessionRef.current); };
  }, [fetchSession]);

  useEffect(() => {
    if (!session) {
      if (pollScreenshotRef.current) clearInterval(pollScreenshotRef.current);
      if (pollUrlRef.current) clearInterval(pollUrlRef.current);
      return;
    }
    fetchScreenshot(session.id);
    fetchUrl(session.id);
    pollScreenshotRef.current = setInterval(() => fetchScreenshot(session.id), 150);
    pollUrlRef.current = setInterval(() => fetchUrl(session.id), 1000);
    return () => {
      if (pollScreenshotRef.current) clearInterval(pollScreenshotRef.current);
      if (pollUrlRef.current) clearInterval(pollUrlRef.current);
    };
  }, [session, fetchScreenshot, fetchUrl]);

  // ── Browser toolbar actions ──────────────────────────────────────────────

  const handleBack = () => {
    if (!session || signalled) return;
    fetch(`${apiBase}/api/login-assist/${session.id}/back`, { method: "POST" }).catch(() => {});
  };

  const handleForward = () => {
    if (!session || signalled) return;
    fetch(`${apiBase}/api/login-assist/${session.id}/forward`, { method: "POST" }).catch(() => {});
  };

  const handleReload = () => {
    if (!session || signalled) return;
    fetch(`${apiBase}/api/login-assist/${session.id}/reload`, { method: "POST" }).catch(() => {});
  };

  const handleNavigate = async (url: string) => {
    if (!session || signalled || !url.trim()) return;
    setNavigating(true);
    try {
      await fetch(`${apiBase}/api/login-assist/${session.id}/navigate`, {
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

  // ── Mouse / keyboard relays ──────────────────────────────────────────────

  function getNormalized(e: React.MouseEvent<HTMLImageElement>): { nx: number; ny: number } | null {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { nx, ny };
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!session || signalled) return;
    e.preventDefault();
    const pos = getNormalized(e);
    if (!pos) return;
    const rect = imgRef.current!.getBoundingClientRect();
    setClickFeedback({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    fetch(`${apiBase}/api/login-assist/${session.id}/mousedown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normalizedX: pos.nx, normalizedY: pos.ny }),
    }).catch(() => {});
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!session || signalled) return;
    e.preventDefault();
    setTimeout(() => setClickFeedback(null), 600);
    const pos = getNormalized(e);
    if (!pos) return;
    fetch(`${apiBase}/api/login-assist/${session.id}/mouseup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normalizedX: pos.nx, normalizedY: pos.ny }),
    }).catch(() => {});
  };

  const handleWheel = async (e: React.WheelEvent<HTMLImageElement>) => {
    if (!session || signalled || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    try {
      await fetch(`${apiBase}/api/login-assist/${session.id}/scroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizedX: nx, normalizedY: ny, deltaX: e.deltaX, deltaY: e.deltaY }),
      });
    } catch { /* ignore */ }
  };

  const handleTypeKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!session || signalled) return;
    if (e.key === "Enter") {
      e.preventDefault();
      await fetch(`${apiBase}/api/login-assist/${session.id}/key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "Enter" }),
      }).catch(() => {});
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      await fetch(`${apiBase}/api/login-assist/${session.id}/key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "Backspace" }),
      }).catch(() => {});
      setTypeBuffer((b) => b.slice(0, -1));
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      await fetch(`${apiBase}/api/login-assist/${session.id}/key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "Tab" }),
      }).catch(() => {});
      return;
    }
  };

  const handleTypeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!session || signalled) return;
    const newVal = e.target.value;
    const added = newVal.slice(typeBuffer.length);
    setTypeBuffer(newVal);
    if (added) {
      await fetch(`${apiBase}/api/login-assist/${session.id}/type`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: added }),
      }).catch(() => {});
    }
  };

  const handleDone = async () => {
    if (!session || signalled) return;
    setSignalled(true);
    try {
      await fetch(`${apiBase}/api/login-assist/${session.id}/done`, { method: "POST" });
    } catch { /* ignore */ }
  };

  const handleGiveUp = async () => {
    if (!session || signalled) return;
    setSignalled(true);
    try {
      await fetch(`${apiBase}/api/login-assist/${session.id}/give-up`, { method: "POST" });
    } catch { /* ignore */ }
  };

  if (!session) return null;

  const isManual = session.isManual;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-3xl mx-4 rounded-xl border border-blue-500/40 bg-zinc-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 bg-blue-500/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse block" />
            <span className="text-sm font-semibold text-blue-300">
              {isManual ? "Manual Sign In" : "Login Human Assist"}
            </span>
            <span className="text-xs text-muted-foreground">{session.retailer}</span>
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
              onFocus={() => {
                setAddressBarFocused(true);
                setAddressBarValue(currentUrl);
              }}
              onBlur={() => setAddressBarFocused(false)}
              onKeyDown={handleAddressKeyDown}
              disabled={signalled}
              placeholder="Enter URL and press Enter…"
              className="w-full h-7 rounded-md border border-border/50 bg-zinc-900 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition disabled:opacity-40"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="px-5 pt-2.5 pb-1.5 shrink-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isManual ? (
              <>
                <strong className="text-foreground">Use the browser above</strong> to navigate
                to {session.retailer} and complete sign-in yourself — use the back/forward buttons,
                type a URL in the bar, or click the live browser below. When you are fully
                signed in, click <strong className="text-emerald-400">I'm Done</strong> — your
                session will be saved and future logins will happen automatically.
              </>
            ) : (
              <>
                The bot couldn't find the login form.{" "}
                <strong className="text-foreground">Click the image</strong> to navigate the live
                browser — open menus, click Sign In, reach the login page. Use the keyboard bar to
                type. When the login form is visible, click{" "}
                <strong className="text-emerald-400">I'm Done</strong> and the bot fills your
                credentials automatically.
              </>
            )}
          </p>
        </div>

        {/* Screenshot */}
        <div className="px-5 pb-2 flex-1 min-h-0 overflow-hidden">
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
                    <div className="h-7 w-7 rounded-full border-2 border-blue-400 bg-blue-400/25 animate-ping" />
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                Loading browser view…
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground text-center">
            <MousePointer className="inline w-3 h-3 mr-1 -mt-0.5" />
            Click or hold to interact · Scroll to scroll the page
          </p>
        </div>

        {/* Keyboard bar */}
        <div className="px-5 pb-2 shrink-0">
          <div className="flex items-center gap-2 rounded-md border border-border/50 bg-zinc-950 px-3 py-1.5">
            <Keyboard className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={typeBuffer}
              onChange={handleTypeChange}
              onKeyDown={handleTypeKeyDown}
              disabled={signalled}
              placeholder="Click here then type to send keystrokes to the browser…"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-border/40 bg-zinc-950/40 shrink-0">
          <Button
            onClick={handleDone}
            disabled={signalled}
            className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle className="w-4 h-4" />
            {isManual ? "I'm Signed In — Save Session" : "I'm Done — Continue Bot"}
          </Button>
          <Button
            variant="outline"
            onClick={handleGiveUp}
            disabled={signalled}
            className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10"
          >
            <XCircle className="w-4 h-4" />
            {isManual ? "Cancel" : "Give Up — Cancel Login"}
          </Button>
        </div>

        {signalled && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm rounded-xl">
            <div className="text-center space-y-3">
              <div className="h-9 w-9 rounded-full border-4 border-blue-400 border-t-transparent animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">
                {isManual ? "Saving your session…" : "Bot resuming login…"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
