export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  /** Plain-password auth (non-Gmail or Gmail with App Password). */
  password?: string;
  /** XOAUTH2 access token (Gmail OAuth). Takes priority over password when set. */
  accessToken?: string;
}

export async function imapFetchCode(
  config: ImapConfig,
  pattern: RegExp,
  timeoutMs = 30000,
): Promise<string | null> {
  // imapflow is lazy-loaded so the module can be evaluated without it present
  // at startup in the packaged Electron build.
  const { ImapFlow } = await import("imapflow");

  const deadline = Date.now() + timeoutMs;
  const pollInterval = 3000;

  const auth = config.accessToken
    ? { user: config.user, accessToken: config.accessToken }
    : { user: config.user, pass: config.password ?? "" };

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.port === 993,
    auth,
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      while (Date.now() < deadline) {
        const since = new Date(Date.now() - 120_000);

        const candidates: { date: Date; code: string }[] = [];
        for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
          const subject = msg.envelope?.subject ?? "";
          const body = msg.source?.toString("utf8") ?? "";
          if (!pattern.test(subject) && !pattern.test(body)) continue;
          const combined = `${subject}\n${body}`;
          const match = combined.match(/\b(\d{6})\b/);
          if (match) {
            candidates.push({
              date: msg.envelope?.date ?? new Date(0),
              code: match[1],
            });
          }
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
          return candidates[0].code;
        }

        if (Date.now() + pollInterval < deadline) {
          await new Promise((r) => setTimeout(r, pollInterval));
        } else {
          break;
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return null;
}
