import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { createWebSocketServer, initStatusCacheFromDb } from "./lib/websocket";
import { setMaxConcurrency } from "./lib/taskWorker";
import { getOrCreateSettings } from "./routes/settings";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

createWebSocketServer(server);

async function bootstrap(): Promise<void> {
  // Load persisted settings and apply to task worker before accepting requests
  try {
    const settings = await getOrCreateSettings();
    setMaxConcurrency(settings.concurrency);
    logger.info({ concurrency: settings.concurrency }, "Settings loaded — concurrency applied");
  } catch (err) {
    logger.warn({ err }, "Could not load settings on startup; using defaults");
  }

  // Pre-populate status cache from DB so clients see correct badges after a restart
  try {
    await initStatusCacheFromDb();
    logger.info("Status cache pre-populated from DB");
  } catch (err) {
    logger.warn({ err }, "Could not pre-populate status cache from DB");
  }

  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fatal error during server bootstrap");
  process.exit(1);
});
