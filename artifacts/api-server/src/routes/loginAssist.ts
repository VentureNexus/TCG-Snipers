import { Router, type IRouter } from "express";
import {
  getActiveSession,
  getCurrentUrl,
  relayLoginClick,
  relayLoginMouseDown,
  relayLoginMouseUp,
  relayLoginScroll,
  relayLoginKey,
  relayLoginSpecialKey,
  relayLoginNavigate,
  relayLoginGoBack,
  relayLoginGoForward,
  relayLoginReload,
  getLoginScreenshot,
  signalLoginDone,
  signalLoginGiveUp,
} from "../lib/loginAssistManager";

const router: IRouter = Router();

router.get("/login-assist/active", (_req, res): void => {
  const session = getActiveSession();
  res.json(session ?? null);
});

router.get("/login-assist/:id/url", (req, res): void => {
  const url = getCurrentUrl(req.params.id);
  res.json({ url: url ?? "" });
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

router.post("/login-assist/:id/navigate", async (req, res): Promise<void> => {
  const { url } = req.body as { url?: unknown };
  if (typeof url !== "string" || !url) {
    res.status(400).json({ error: "url is required" });
    return;
  }
  const ok = await relayLoginNavigate(req.params.id, url);
  res.json({ ok });
});

router.post("/login-assist/:id/back", async (req, res): Promise<void> => {
  const ok = await relayLoginGoBack(req.params.id);
  res.json({ ok });
});

router.post("/login-assist/:id/forward", async (req, res): Promise<void> => {
  const ok = await relayLoginGoForward(req.params.id);
  res.json({ ok });
});

router.post("/login-assist/:id/reload", async (req, res): Promise<void> => {
  const ok = await relayLoginReload(req.params.id);
  res.json({ ok });
});

router.post("/login-assist/:id/click", async (req, res): Promise<void> => {
  const { normalizedX, normalizedY } = req.body as { normalizedX?: unknown; normalizedY?: unknown };
  if (typeof normalizedX !== "number" || typeof normalizedY !== "number") {
    res.status(400).json({ error: "normalizedX and normalizedY (0–1) are required" });
    return;
  }
  const ok = await relayLoginClick(req.params.id, normalizedX, normalizedY);
  res.json({ ok });
});

router.post("/login-assist/:id/mousedown", (req, res): void => {
  const { normalizedX, normalizedY } = req.body as { normalizedX?: unknown; normalizedY?: unknown };
  if (typeof normalizedX !== "number" || typeof normalizedY !== "number") {
    res.status(400).json({ error: "normalizedX and normalizedY (0–1) are required" });
    return;
  }
  res.json({ ok: true });
  relayLoginMouseDown(req.params.id, normalizedX, normalizedY).catch(() => {});
});

router.post("/login-assist/:id/mouseup", (req, res): void => {
  const { normalizedX, normalizedY } = req.body as { normalizedX?: unknown; normalizedY?: unknown };
  if (typeof normalizedX !== "number" || typeof normalizedY !== "number") {
    res.status(400).json({ error: "normalizedX and normalizedY (0–1) are required" });
    return;
  }
  res.json({ ok: true });
  relayLoginMouseUp(req.params.id, normalizedX, normalizedY).catch(() => {});
});

router.post("/login-assist/:id/scroll", async (req, res): Promise<void> => {
  const { normalizedX, normalizedY, deltaX, deltaY } = req.body as {
    normalizedX?: unknown; normalizedY?: unknown; deltaX?: unknown; deltaY?: unknown;
  };
  if (
    typeof normalizedX !== "number" || typeof normalizedY !== "number" ||
    typeof deltaX !== "number" || typeof deltaY !== "number"
  ) {
    res.status(400).json({ error: "normalizedX, normalizedY, deltaX, deltaY are required" });
    return;
  }
  const ok = await relayLoginScroll(req.params.id, normalizedX, normalizedY, deltaX, deltaY);
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

router.post("/login-assist/:id/done", async (req, res): Promise<void> => {
  const ok = await signalLoginDone(req.params.id);
  res.json({ ok });
});

router.post("/login-assist/:id/give-up", (req, res): void => {
  const ok = signalLoginGiveUp(req.params.id);
  res.json({ ok });
});

export default router;
