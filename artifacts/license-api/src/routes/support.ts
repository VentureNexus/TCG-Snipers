import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { sendEmail, supportTicketEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: Router = Router();

const SUPPORT_TO = process.env.SUPPORT_EMAIL ?? "support@tcgsnipers.com";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_FILES = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
});

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(10).max(8000),
});

router.post("/support", upload.array("attachments", MAX_FILES), async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please fill in all required fields." });
    return;
  }
  const { name, email, subject, message } = parsed.data;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  try {
    const tpl = supportTicketEmail({
      fromName: name,
      fromEmail: email,
      subject,
      message,
      attachmentCount: files.length,
    });
    await sendEmail({
      to: SUPPORT_TO,
      subject: tpl.subject,
      html: tpl.html,
      replyTo: email,
      attachments: files.map((f) => ({
        filename: f.originalname,
        content: f.buffer.toString("base64"),
        contentType: f.mimetype,
      })),
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Support email failed");
    res.status(500).json({ error: "Could not send your message right now. Please try again." });
  }
});

export default router;
