import { useState, useEffect } from "react";
import { getApiBase } from "@/lib/api-base";

function isPlaceholder(url?: string | null): boolean {
  if (!url) return true;
  return url.includes("placehold.co") || url.includes("placeholder.com") || url.includes("via.placeholder");
}

export function ProductThumbnail({
  src,
  fallbackUrl,
  resultId,
  className = "w-10 h-10 rounded object-cover bg-muted shrink-0",
}: {
  src?: string | null;
  fallbackUrl?: string | null;
  resultId?: number | null;
  className?: string;
}) {
  const realSrc = isPlaceholder(src) ? null : src;
  const [resolved, setResolved] = useState<string>(realSrc || "");

  useEffect(() => {
    if (realSrc) { setResolved(realSrc); return; }
    if (!fallbackUrl || !/^https?:\/\//.test(fallbackUrl)) return;
    let cancelled = false;
    fetch(`${getApiBase()}/api/og-image?url=${encodeURIComponent(fallbackUrl)}`)
      .then((r) => r.json())
      .then((data: { imageUrl: string }) => {
        if (cancelled || !data.imageUrl) return;
        setResolved(data.imageUrl);
        if (resultId) {
          fetch(`${getApiBase()}/api/checkout-results/${resultId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productImage: data.imageUrl }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [realSrc, fallbackUrl, resultId]);

  if (!resolved) return null;
  return (
    <img
      src={resolved}
      alt=""
      className={className}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}
