import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(500).json({ error: message });
  }
});

export default app;

// Re-export server-lifecycle functions so the Electron main process can call
// them after it creates the HTTP server wrapping this Express app.
// (index.ts calls these itself in standalone mode; Electron uses these exports.)
export { createWebSocketServer, initStatusCacheFromDb } from "./lib/websocket";
export { setMaxConcurrency } from "./lib/taskWorker";
export { getOrCreateSettings } from "./routes/settings";
export { setTtlHours } from "./lib/retailers/sessionCache";
