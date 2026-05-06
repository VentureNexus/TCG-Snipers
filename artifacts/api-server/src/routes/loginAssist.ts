import { Router, type IRouter } from "express";
import {
  getActiveSession,
  relayLoginClick,
  relayLoginKey,
  relayLoginSpecialKey,
  getLoginScreenshot,
  signalLoginDone,
  signalLoginGiveUp,
} from "../lib/loginAssistManager";

const router: IRouter = Router();

router.get("/login-assist/active", (_req, res): void => {
  const session = getActiveSession();
  res.json(session ?? null);
});

router.get("/login-assist/:id/screenshot", async (req, res): Promise<void> => {
  const buf = await getLoginScreenshot(req.params.id);
  if (!buf) {
    res.status(404).json({ error: "No active login assist session" });
    return;
  }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-store, no-cache");
  res.send(buf);
});

router.post("/login-assist/:id/click", async (req, res): Promise<void> => {
  const { normalizedX, normalizedY } = req.body as {
    normalizedX?: unknown;
    normalizedY?: unknown;
  };
  if (typeof normalizedX !== "number" || typeof normalizedY !== "number") {
    res.status(400).json({ error: "normalizedX and normalizedY (0–1) are required" });
    return;
  }
  const ok = await relayLoginClick(req.params.id, normalizedX, normalizedY);
  res.json({ ok });
});

router.post("/login-assist/:id/type", async (req, res): Promise<void> => {
  const { text } = req.body as { text?: unknown };
  if (typeof text !== "string" || !text) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const ok = await relayLoginKey(req.params.id, text);
  res.json({ ok });
});

router.post("/login-assist/:id/key", async (req, res): Promise<void> => {
  const { key } = req.body as { key?: unknown };
  if (typeof key !== "string" || !key) {
    res.status(400).json({ error: "key is required" });
    return;
  }
  const ok = await relayLoginSpecialKey(req.params.id, key);
  res.json({ ok });
});

router.post("/login-assist/:id/done", (req, res): void => {
  const ok = signalLoginDone(req.params.id);
  res.json({ ok });
});

router.post("/login-assist/:id/give-up", (req, res): void => {
  const ok = signalLoginGiveUp(req.params.id);
  res.json({ ok });
});

export default router;
