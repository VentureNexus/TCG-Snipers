import { Router } from "express";

const router: Router = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "license-api", time: new Date().toISOString() });
});

export default router;
