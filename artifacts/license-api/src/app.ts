import express, { type Express } from "express";
import cors, { type CorsOptionsDelegate } from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import webhooks from "./routes/webhooks";
import router from "./routes";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Origin allow-list: marketing site URL + any extras in CORS_EXTRA_ORIGINS.
// Electron renderers don't send an Origin header (or send file://) so they're permitted.
const ALLOWED_ORIGINS = new Set<string>(
  [process.env.MARKETING_SITE_URL, ...(process.env.CORS_EXTRA_ORIGINS ?? "").split(",")]
    .map((s) => (s ?? "").trim())
    .filter(Boolean),
);
const ALLOW_ALL_DEV = process.env.NODE_ENV !== "production";

const corsDelegate: CorsOptionsDelegate = (req, callback) => {
  const origin = req.headers.origin;
  // No Origin header → server-to-server, Electron file://, curl, etc. — allow.
  if (!origin) return callback(null, { origin: true, credentials: false });
  if (ALLOWED_ORIGINS.has(origin) || ALLOW_ALL_DEV) {
    return callback(null, { origin, credentials: false });
  }
  return callback(null, { origin: false });
};
app.use(cors(corsDelegate));

// Webhooks router uses raw body parser internally and MUST be mounted BEFORE express.json().
app.use("/license", webhooks);

app.use(express.json({ limit: "1mb" }));
app.use("/license", router);

export default app;
