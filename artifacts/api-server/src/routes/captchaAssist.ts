import { Router, type IRouter } from "express";
import { relayClick, getScreenshot, signalDone, signalGiveUp } from "../lib/captchaAssistManager";

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
