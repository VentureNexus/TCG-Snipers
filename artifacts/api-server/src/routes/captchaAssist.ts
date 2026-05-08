import { Router, type IRouter } from "express";
import {
  getCurrentUrl,
  relayClick,
  relayMouseDown,
  relayMouseUp,
  relayScroll,
  relayNavigate,
  relayGoBack,
  relayGoForward,
  relayReload,
  getScreenshot,
  signalDone,
  signalGiveUp,
} from "../lib/captchaAssistManager";

const router: IRouter = Router();

router.get("/captcha-assist/:id/screenshot", async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const buf = await getScreenshot(taskId);
  if (!buf) { res.status(404).json({ error: "No active assist session for this task" }); return; }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-store, no-cache");
  res.send(buf);
});

router.get("/captcha-assist/:id/url", (req, res): void => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const url = getCurrentUrl(taskId);
  res.json({ url: url ?? "" });
});

router.post("/captcha-assist/:id/navigate", async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const { url } = req.body as { url?: unknown };
  if (typeof url !== "string" || !url) { res.status(400).json({ error: "url is required" }); return; }
  const ok = await relayNavigate(taskId, url);
  res.json({ ok });
});

router.post("/captcha-assist/:id/back", async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const ok = await relayGoBack(taskId);
  res.json({ ok });
});

router.post("/captcha-assist/:id/forward", async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const ok = await relayGoForward(taskId);
  res.json({ ok });
});

router.post("/captcha-assist/:id/reload", async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const ok = await relayReload(taskId);
  res.json({ ok });
});

router.post("/captcha-assist/:id/click", async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const { normalizedX, normalizedY } = req.body as { normalizedX?: unknown; normalizedY?: unknown };
  if (typeof normalizedX !== "number" || typeof normalizedY !== "number") {
    res.status(400).json({ error: "normalizedX and normalizedY (0–1) are required" }); return;
  }
  const ok = await relayClick(taskId, normalizedX, normalizedY);
  res.json({ ok });
});

router.post("/captcha-assist/:id/mousedown", (req, res): void => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const { normalizedX, normalizedY } = req.body as { normalizedX?: unknown; normalizedY?: unknown };
  if (typeof normalizedX !== "number" || typeof normalizedY !== "number") {
    res.status(400).json({ error: "normalizedX and normalizedY (0–1) are required" }); return;
  }
  res.json({ ok: true });
  relayMouseDown(taskId, normalizedX, normalizedY).catch(() => {});
});

router.post("/captcha-assist/:id/mouseup", (req, res): void => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const { normalizedX, normalizedY } = req.body as { normalizedX?: unknown; normalizedY?: unknown };
  if (typeof normalizedX !== "number" || typeof normalizedY !== "number") {
    res.status(400).json({ error: "normalizedX and normalizedY (0–1) are required" }); return;
  }
  res.json({ ok: true });
  relayMouseUp(taskId, normalizedX, normalizedY).catch(() => {});
});

router.post("/captcha-assist/:id/scroll", async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const { normalizedX, normalizedY, deltaX, deltaY } = req.body as {
    normalizedX?: unknown; normalizedY?: unknown; deltaX?: unknown; deltaY?: unknown;
  };
  if (
    typeof normalizedX !== "number" || typeof normalizedY !== "number" ||
    typeof deltaX !== "number" || typeof deltaY !== "number"
  ) {
    res.status(400).json({ error: "normalizedX, normalizedY, deltaX, deltaY are required" }); return;
  }
  const ok = await relayScroll(taskId, normalizedX, normalizedY, deltaX, deltaY);
  res.json({ ok });
});

router.post("/captcha-assist/:id/done", async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const ok = signalDone(taskId);
  res.json({ ok });
});

router.post("/captcha-assist/:id/give-up", async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }
  const ok = signalGiveUp(taskId);
  res.json({ ok });
});

export default router;
