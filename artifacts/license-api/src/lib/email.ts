import { logger } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "TCG Snipers <noreply@tcgsnipers.com>";
const ALLOW_LOG_FALLBACK = process.env.NODE_ENV !== "production";

const BRAND = {
  name: "TCG Snipers",
  marketingUrl: "https://www.tcgsnipers.com",
  logoUrl: "https://www.tcgsnipers.com/email-logo.png",
  primary: "#facc15",
  primaryDark: "#eab308",
  text: "#0f0f0f",
  muted: "#6b7280",
  bg: "#fafafa",
  card: "#ffffff",
  border: "#e5e7eb",
  dark: "#0a0a0a",
};

interface SendAttachment {
  filename: string;
  content: string; // base64-encoded
  contentType?: string;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: SendAttachment[];
}

/**
 * Send an email via Resend.
 * - In production, RESEND_API_KEY is required: missing → throw (so callers surface a 500
 *   rather than silently swallowing license keys / magic links).
 * - In development we allow a log-only fallback that records ONLY the recipient and
 *   subject. The body (which contains license keys / magic-link tokens) is never logged.
 */
export async function sendEmail({ to, subject, html, replyTo, attachments }: SendArgs): Promise<void> {
  if (!RESEND_API_KEY) {
    if (!ALLOW_LOG_FALLBACK) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    logger.warn(
      { to, subject, attachments: attachments?.length ?? 0 },
      "RESEND_API_KEY not set — skipping send (dev only). Body intentionally not logged.",
    );
    return;
  }
  const body: Record<string, unknown> = { from: FROM, to, subject, html };
  if (replyTo) body.reply_to = replyTo;
  if (attachments && attachments.length > 0) body.attachments = attachments;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, text, to, subject }, "Resend API error");
    throw new Error(`Resend send failed (${res.status})`);
  }
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Wrap body content in a branded email layout. Uses table-based markup +
 * inline styles for maximum email client compatibility (Gmail, Outlook, Apple
 * Mail, ProtonMail, etc.). Renders a dark header strip with logo, the body
 * card on a light background, and a small footer with manage / support links.
 */
function emailLayout(opts: {
  preheader: string; // hidden 1-line summary shown in inbox preview
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${BRAND.name}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;font-size:1px;line-height:1px;color:${BRAND.bg};max-height:0;max-width:0;overflow:hidden;">${escapeHtml(opts.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td align="center" style="background:${BRAND.dark};border-radius:12px 12px 0 0;padding:28px 24px;">
              <a href="${BRAND.marketingUrl}" style="text-decoration:none;display:inline-block;">
                <img src="${BRAND.logoUrl}" alt="${BRAND.name}" width="80" height="86" style="display:block;border:0;outline:none;text-decoration:none;height:86px;width:80px;">
              </a>
              <div style="margin-top:10px;color:${BRAND.primary};font-size:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${BRAND.name}</div>
            </td>
          </tr>
          <!-- Body card -->
          <tr>
            <td style="background:${BRAND.card};border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};padding:36px 32px;color:${BRAND.text};font-size:15px;line-height:1.6;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 12px 12px;padding:20px 32px 28px;color:${BRAND.muted};font-size:12px;line-height:1.6;text-align:center;">
              <div style="margin-bottom:8px;">
                <a href="${BRAND.marketingUrl}/manage" style="color:${BRAND.muted};text-decoration:underline;margin:0 8px;">Manage subscription</a>
                <span style="color:${BRAND.border};">•</span>
                <a href="${BRAND.marketingUrl}/support" style="color:${BRAND.muted};text-decoration:underline;margin:0 8px;">Support</a>
                <span style="color:${BRAND.border};">•</span>
                <a href="${BRAND.marketingUrl}" style="color:${BRAND.muted};text-decoration:underline;margin:0 8px;">tcgsnipers.com</a>
              </div>
              <div style="color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;"><tr><td align="center" style="background:${BRAND.primary};border-radius:8px;"><a href="${href}" style="display:inline-block;padding:14px 28px;color:${BRAND.dark};font-weight:700;text-decoration:none;font-size:15px;letter-spacing:0.3px;">${label}</a></td></tr></table>`;

export function supportTicketEmail(args: {
  fromName: string;
  fromEmail: string;
  subject: string;
  message: string;
  attachmentCount: number;
}): { subject: string; html: string } {
  const safeMsg = escapeHtml(args.message).replace(/\n/g, "<br>");
  const body = `
    <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:${BRAND.text};">New support request</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:20px;width:100%;">
      <tr>
        <td style="padding:6px 14px 6px 0;color:${BRAND.muted};font-size:13px;width:110px;vertical-align:top;">From</td>
        <td style="padding:6px 0;color:${BRAND.text};font-size:14px;">${escapeHtml(args.fromName)} &lt;<a href="mailto:${escapeHtml(args.fromEmail)}" style="color:${BRAND.text};">${escapeHtml(args.fromEmail)}</a>&gt;</td>
      </tr>
      <tr>
        <td style="padding:6px 14px 6px 0;color:${BRAND.muted};font-size:13px;vertical-align:top;">Subject</td>
        <td style="padding:6px 0;color:${BRAND.text};font-size:14px;">${escapeHtml(args.subject)}</td>
      </tr>
      <tr>
        <td style="padding:6px 14px 6px 0;color:${BRAND.muted};font-size:13px;vertical-align:top;">Attachments</td>
        <td style="padding:6px 0;color:${BRAND.text};font-size:14px;">${args.attachmentCount}</td>
      </tr>
    </table>
    <div style="background:#fafaf5;border-left:4px solid ${BRAND.primary};padding:18px 20px;border-radius:6px;color:${BRAND.text};font-size:14px;line-height:1.65;">
      ${safeMsg}
    </div>
    <p style="color:${BRAND.muted};font-size:12px;margin:24px 0 0;">Reply to this email to respond directly to the customer.</p>
  `;
  return {
    subject: `[Support] ${args.subject}`,
    html: emailLayout({
      preheader: `Support request from ${args.fromName}`,
      bodyHtml: body,
    }),
  };
}

export function licenseIssuedEmail(licenseKey: string, marketingUrl: string): { subject: string; html: string } {
  const body = `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:${BRAND.text};">Welcome aboard.</h1>
    <p style="margin:0 0 18px;color:${BRAND.text};font-size:15px;line-height:1.6;">
      Thanks for joining ${BRAND.name}. Your license key is below — store it somewhere safe.
      You'll need it (along with your email) to activate the desktop app.
    </p>
    <div style="background:${BRAND.dark};border-radius:10px;padding:22px;text-align:center;margin:20px 0;">
      <div style="color:${BRAND.muted};font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">Your license key</div>
      <div style="color:${BRAND.primary};font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:16px;font-weight:600;letter-spacing:2px;word-break:break-all;line-height:1.5;">${escapeHtml(licenseKey)}</div>
    </div>
    <h3 style="margin:28px 0 10px;font-size:15px;font-weight:700;color:${BRAND.text};">Get started in 2 steps</h3>
    <ol style="margin:0 0 20px;padding-left:22px;color:${BRAND.text};font-size:14px;line-height:1.75;">
      <li style="margin-bottom:6px;">Download the desktop app for your OS.</li>
      <li>Open the app, enter your email and the license key above.</li>
    </ol>
    ${button(`${marketingUrl}/download`, "Download the app")}
    <p style="color:${BRAND.muted};font-size:13px;line-height:1.6;margin:24px 0 0;border-top:1px solid ${BRAND.border};padding-top:18px;">
      Need to swap devices, update billing, or cancel? Visit
      <a href="${marketingUrl}/manage" style="color:${BRAND.text};text-decoration:underline;">your account</a>
      any time — no password required.
    </p>
  `;
  return {
    subject: "Your TCG Snipers license key",
    html: emailLayout({
      preheader: "Your license key is inside — keep this email safe.",
      bodyHtml: body,
    }),
  };
}

export function magicLinkEmail(magicUrl: string): { subject: string; html: string } {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${BRAND.text};">Sign in to your account</h1>
    <p style="margin:0 0 22px;color:${BRAND.text};font-size:15px;line-height:1.6;">
      Click the button below to access your subscription, swap devices, update payment, or download the app.
      This link is good for <strong>15 minutes</strong>.
    </p>
    ${button(magicUrl, "Open my account")}
    <p style="color:${BRAND.muted};font-size:13px;line-height:1.6;margin:24px 0 0;">
      Trouble with the button? Copy and paste this link into your browser:<br>
      <a href="${magicUrl}" style="color:${BRAND.text};word-break:break-all;text-decoration:underline;font-size:12px;">${magicUrl}</a>
    </p>
    <p style="color:${BRAND.muted};font-size:12px;line-height:1.6;margin:24px 0 0;border-top:1px solid ${BRAND.border};padding-top:18px;">
      Didn't request this? You can safely ignore this email — no one can access your account without clicking the link above.
    </p>
  `;
  return {
    subject: "Sign in to TCG Snipers",
    html: emailLayout({
      preheader: "Your sign-in link expires in 15 minutes.",
      bodyHtml: body,
    }),
  };
}
