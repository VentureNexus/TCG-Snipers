import { logger } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "TCG Snipers <noreply@tcgsnipers.com>";
const ALLOW_LOG_FALLBACK = process.env.NODE_ENV !== "production";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email via Resend.
 * - In production, RESEND_API_KEY is required: missing → throw (so callers surface a 500
 *   rather than silently swallowing license keys / magic links).
 * - In development we allow a log-only fallback that records ONLY the recipient and
 *   subject. The body (which contains license keys / magic-link tokens) is never logged.
 */
export async function sendEmail({ to, subject, html }: SendArgs): Promise<void> {
  if (!RESEND_API_KEY) {
    if (!ALLOW_LOG_FALLBACK) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    logger.warn(
      { to, subject },
      "RESEND_API_KEY not set — skipping send (dev only). Body intentionally not logged.",
    );
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, text, to, subject }, "Resend API error");
    throw new Error(`Resend send failed (${res.status})`);
  }
}

export function licenseIssuedEmail(licenseKey: string, marketingUrl: string): { subject: string; html: string } {
  return {
    subject: "Your TCG Snipers license key",
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #facc15;">Welcome to TCG Snipers</h1>
        <p>Thanks for subscribing. Your license key is below — keep this safe.</p>
        <pre style="background: #111; color: #facc15; padding: 16px; border-radius: 8px; font-size: 16px; letter-spacing: 1px;">${licenseKey}</pre>
        <p>Next steps:</p>
        <ol>
          <li>Download the desktop app: <a href="${marketingUrl}/download">${marketingUrl}/download</a></li>
          <li>Sign in with your email + this license key.</li>
        </ol>
        <p style="color: #888; font-size: 12px;">Manage your subscription at <a href="${marketingUrl}/manage">${marketingUrl}/manage</a></p>
      </div>
    `,
  };
}

export function magicLinkEmail(magicUrl: string): { subject: string; html: string } {
  return {
    subject: "Your TCG Snipers manage-license link",
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2>Manage your TCG Snipers license</h2>
        <p>Click below to view your subscription and active device. This link expires in 15 minutes.</p>
        <p><a href="${magicUrl}" style="display: inline-block; background: #facc15; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Open License Portal</a></p>
        <p style="color: #888; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  };
}
