import { useEffect, useState } from "react";

interface WhatsNewPayload {
  version: string;
  releaseNotes: string | null;
}

function formatNotes(raw: string | null | undefined): string[] {
  if (!raw || raw.trim().length === 0) {
    return ["Improvements and bug fixes."];
  }

  // Strip HTML tags and decode common entities
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(li|p|div|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lower = text.toLowerCase();
  const isBugFix = /\b(fix(es|ed)?|bug(s)?|hotfix|patch|crash|issue)\b/.test(lower);
  const isPerf = /\b(performance|faster|speed(s)?|optim(ize|ization)|latency)\b/.test(lower);

  // Try markdown bullet lists first (- or * or •)
  const bulletItems = text.match(/^[ \t]*[-*•]\s+.+/gm) ?? [];
  if (bulletItems.length >= 2) {
    return bulletItems
      .map((item) => item.replace(/^[ \t]*[-*•]\s+/, "").trim())
      .filter((s) => s.length > 0)
      .slice(0, 8);
  }

  // Try numbered lists
  const numberedItems = text.match(/^[ \t]*\d+[.)]\s+.+/gm) ?? [];
  if (numberedItems.length >= 2) {
    return numberedItems
      .map((item) => item.replace(/^[ \t]*\d+[.)]\s+/, "").trim())
      .filter((s) => s.length > 0)
      .slice(0, 8);
  }

  // Short text / keywords only → use simple category bullets
  if (text.length < 120) {
    const bullets: string[] = [];
    if (isBugFix) bullets.push("Bug fixes and stability improvements");
    if (isPerf) bullets.push("Performance improvements");
    if (bullets.length === 0) bullets.push("Minor improvements and updates");
    return bullets;
  }

  // Longer text with paragraph breaks → split into lines
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 4 && !/^#{1,6}\s/.test(l))
    .slice(0, 6);
  if (lines.length >= 2) return lines;

  // Single prose block → categorize simply
  const bullets: string[] = [];
  if (isBugFix) bullets.push("Bug fixes and stability improvements");
  if (isPerf) bullets.push("Performance improvements");
  if (bullets.length === 0) bullets.push("Minor improvements and updates");
  return bullets;
}

export function WhatsNewDialog() {
  const [payload, setPayload] = useState<WhatsNewPayload | null>(null);

  useEffect(() => {
    const updates = window.electronAPI?.updates;
    if (!updates) return;
    void updates.getPendingWhatsNew().then((data) => {
      if (data) setPayload(data);
    });
  }, []);

  if (!payload) return null;

  const bullets = formatNotes(payload.releaseNotes);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="whats-new-dialog"
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary text-lg font-bold select-none">
              ✦
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                What's new in v{payload.version}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                TCG Snipers has been updated
              </p>
            </div>
          </div>
        </div>

        {/* Bullet list */}
        <div className="px-6 py-5">
          <ul className="space-y-2.5">
            {bullets.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-[6px]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <button
            type="button"
            onClick={() => setPayload(null)}
            className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-2.5 font-semibold text-sm hover:opacity-90 transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
