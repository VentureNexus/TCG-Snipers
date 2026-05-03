import { ImapFlow } from "imapflow";

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export async function imapFetchCode(
  config: ImapConfig,
  pattern: RegExp,
  timeoutMs = 30000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 3000;

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.port === 993,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      while (Date.now() < deadline) {
        const since = new Date(Date.now() - 120_000);

        // Collect all matching messages then pick the newest
        const candidates: { date: Date; code: string }[] = [];
        for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
          const subject = msg.envelope?.subject ?? "";
          const body = msg.source?.toString("utf8") ?? "";
          // Match pattern against subject OR body
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
          // Return code from the most recent matching email
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
