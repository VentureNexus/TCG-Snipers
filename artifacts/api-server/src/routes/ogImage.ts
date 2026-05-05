import { Router } from "express";
import dns from "node:dns/promises";
import net from "node:net";

const router = Router();

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      ip === "0.0.0.0"
    );
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized === "::"
    );
  }
  return true;
}

async function isSafeUrl(urlStr: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const hostname = parsed.hostname;

  if (net.isIP(hostname)) {
    return !isPrivateIp(hostname);
  }

  try {
    const { address } = await dns.lookup(hostname);
    return !isPrivateIp(address);
  } catch {
    return false;
  }
}

function extractImageFromHtml(html: string, baseUrl: string): string {
  // 1. Standard og:image / twitter:image meta tags
  const metaMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  if (metaMatch?.[1]) return metaMatch[1];

  // 2. Amazon: data-a-dynamic-image JSON on the main product image
  const amazonDynMatch = html.match(/data-a-dynamic-image=["'](\{[^"']+\})["']/i);
  if (amazonDynMatch?.[1]) {
    try {
      const parsed = JSON.parse(amazonDynMatch[1].replace(/&quot;/g, '"'));
      const urls = Object.keys(parsed);
      if (urls.length > 0) return urls[0];
    } catch { /* ignore */ }
  }

  // 3. Amazon: landingImage src attribute
  const landingMatch = html.match(/id=["']landingImage["'][^>]+src=["']([^"']+)["']/i) ||
    html.match(/src=["']([^"']+)["'][^>]+id=["']landingImage["']/i);
  if (landingMatch?.[1] && landingMatch[1].startsWith("http")) return landingMatch[1];

  // 4. JSON-LD Product image
  const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const block of jsonLdMatch) {
      const inner = block.replace(/<script[^>]*>/, "").replace(/<\/script>/, "");
      try {
        const obj = JSON.parse(inner);
        const img = obj?.image || obj?.["@graph"]?.[0]?.image;
        if (typeof img === "string" && img.startsWith("http")) return img;
        if (Array.isArray(img) && img[0]?.startsWith?.("http")) return img[0];
      } catch { /* ignore */ }
    }
  }

  // 5. Best Buy / generic: first large img with media-amazon or similar CDN
  const imgMatch = html.match(/<img[^>]+src=["'](https:\/\/(?:m\.media-amazon\.com|i\.imgur\.com|pisces\.bbystatic\.com|multimedia\.bbycastatic\.ca)[^"']+)["']/i);
  if (imgMatch?.[1]) return imgMatch[1];

  // 6. Fallback: any https image URL with common image extension in src
  const parsed = new URL(baseUrl);
  const genericImg = html.match(/<img[^>]+src=["'](https:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
  if (genericImg?.[1] && !genericImg[1].includes("logo") && !genericImg[1].includes("icon")) {
    return genericImg[1];
  }

  void parsed;
  return "";
}

// Route is /og-image (mounted under /api in app.ts → full path /api/og-image)
router.get("/og-image", async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.json({ imageUrl: "" });

  const safe = await isSafeUrl(url).catch(() => false);
  if (!safe) return res.json({ imageUrl: "" });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) return res.json({ imageUrl: "" });

    const html = await response.text();
    const imageUrl = extractImageFromHtml(html, url);
    res.json({ imageUrl });
  } catch {
    res.json({ imageUrl: "" });
  }
});

export default router;
