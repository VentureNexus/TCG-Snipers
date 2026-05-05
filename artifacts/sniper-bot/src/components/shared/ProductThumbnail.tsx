import { useState, useEffect } from "react";
import { getApiBase } from "@/lib/api-base";

export function ProductThumbnail({
  src,
  fallbackUrl,
  className = "w-10 h-10 rounded object-cover bg-muted shrink-0",
}: {
  src?: string | null;
  fallbackUrl?: string | null;
  className?: string;
}) {
  const [resolved, setResolved] = useState<string>(src || "");

  useEffect(() => {
    if (src) { setResolved(src); return; }
    if (!fallbackUrl || !/^https?:\/\//.test(fallbackUrl)) return;
    let cancelled = false;
    fetch(`${getApiBase()}/api/og-image?url=${encodeURIComponent(fallbackUrl)}`)
      .then((r) => r.json())
      .then((data: { imageUrl: string }) => {
        if (!cancelled && data.imageUrl) setResolved(data.imageUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [src, fallbackUrl]);

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
