import { ImapFlow } from "imapflow";

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export async function imapFetchCode(
  config: ImapConfig,
  subjectPattern: RegExp,
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
        for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
          const subject = msg.envelope?.subject ?? "";
          if (!subjectPattern.test(subject)) continue;
          const body = msg.source?.toString("utf8") ?? "";
          const match = body.match(/\b(\d{6})\b/);
          if (match) return match[1];
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
