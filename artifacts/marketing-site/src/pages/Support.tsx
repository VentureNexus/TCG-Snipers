import { useState, useRef } from "react";
import { LICENSE_API_URL } from "@/lib/api";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SUBJECT_OPTIONS = [
  "Billing or refund question",
  "License activation issue",
  "Device swap / move to new computer",
  "Bug report",
  "Feature request",
  "Account / login help",
  "Other",
];

export default function Support() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0]);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const incoming = Array.from(newFiles);
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is larger than 5 MB.`);
      return;
    }
    const merged = [...files, ...incoming].slice(0, MAX_FILES);
    setFiles(merged);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles(files.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("email", email);
      fd.append("subject", subject);
      fd.append("message", message);
      for (const f of files) fd.append("attachments", f);

      const res = await fetch(`${LICENSE_API_URL}/license/support`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        let msg = "Could not send your message.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) msg = body.error;
        } catch {
          /* noop */
        }
        throw new Error(msg);
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="text-3xl font-bold mb-3">Message sent</h1>
        <p className="text-muted-foreground mb-8">
          Thanks for reaching out. Our support team will reply to{" "}
          <span className="text-foreground font-mono">{email}</span> within 1–2 business days.
        </p>
        <button
          onClick={() => {
            setSubmitted(false);
            setName("");
            setEmail("");
            setSubject(SUBJECT_OPTIONS[0]);
            setMessage("");
            setFiles([]);
          }}
          className="bg-primary text-primary-foreground rounded-md px-6 py-3 font-semibold hover:opacity-90 transition"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight mb-2">Contact support</h1>
      <p className="text-muted-foreground mb-10">
        Have a question, hit a bug, or need help with your license? Send us a message and we'll get
        back to you within 1–2 business days.
      </p>

      <form onSubmit={onSubmit} className="space-y-5 bg-card border border-border rounded-lg p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium mb-2">Your name</label>
            <input
              type="text"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full bg-input/40 border border-border rounded-md px-4 py-3 outline-none focus:border-primary transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email address</label>
            <input
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-input/40 border border-border rounded-md px-4 py-3 outline-none focus:border-primary transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Subject</label>
          <select
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full bg-input/40 border border-border rounded-md px-4 py-3 outline-none focus:border-primary transition"
          >
            {SUBJECT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Message</label>
          <textarea
            required
            minLength={10}
            maxLength={8000}
            rows={7}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's going on. Include any error messages, your license email, and steps to reproduce if it's a bug."
            className="w-full bg-input/40 border border-border rounded-md px-4 py-3 outline-none focus:border-primary transition resize-y"
          />
          <p className="text-xs text-muted-foreground mt-1">{message.length} / 8000</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Attachments <span className="text-muted-foreground font-normal">(optional, up to 5 files, 5 MB each)</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-secondary file:text-foreground hover:file:bg-secondary/80 cursor-pointer"
            disabled={files.length >= MAX_FILES}
          />
          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between bg-secondary/40 border border-border rounded-md px-3 py-2 text-sm"
                >
                  <span className="truncate mr-3">
                    {f.name}{" "}
                    <span className="text-muted-foreground text-xs">
                      ({(f.size / 1024).toFixed(1)} KB)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-muted-foreground hover:text-destructive text-xs font-semibold"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/40 text-destructive rounded-md px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-primary-foreground rounded-md px-6 py-3 font-semibold hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send message"}
        </button>

        <p className="text-xs text-muted-foreground text-center">
          You can also email us directly at{" "}
          <a href="mailto:support@tcgsnipers.com" className="text-primary hover:underline">
            support@tcgsnipers.com
          </a>
          .
        </p>
      </form>
    </div>
  );
}
