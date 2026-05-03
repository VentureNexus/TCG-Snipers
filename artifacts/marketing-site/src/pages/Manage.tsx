import { useState } from "react";
import { licenseApi } from "@/lib/api";

export default function Manage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await licenseApi.requestMagicLink(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-24">
      <h1 className="text-3xl font-bold mb-2">Manage your license</h1>
      <p className="text-muted-foreground mb-8">
        Enter the email you used at checkout. We'll send you a magic link to view your subscription, swap
        devices, and update billing.
      </p>
      {submitted ? (
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="font-semibold text-primary mb-2">Check your inbox</h2>
          <p className="text-sm text-muted-foreground">
            If <span className="text-foreground font-mono">{email}</span> matches an account, a magic link is
            on its way. The link expires in 15 minutes.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4 bg-card border border-border rounded-lg p-6">
          <label className="block text-sm font-medium">Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-input/40 border border-border rounded-md px-4 py-3 outline-none focus:border-primary transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground rounded-md px-6 py-3 font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "Sending…" : "Email me a magic link"}
          </button>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </form>
      )}
    </div>
  );
}
