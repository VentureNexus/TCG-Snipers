import { useState } from "react";
import { useLocation } from "wouter";
import { Check } from "lucide-react";
import { licenseApi } from "@/lib/api";

const INCLUDES = [
  "All-in-one checkout toolkit — monitors, queue, auto-checkout",
  "Every supported retailer module: Target, Walmart, Amazon, Best Buy, TCGplayer, Pokémon Center",
  "Task groups, IMAP email verification, proxy rotation",
  "Encrypted card vault — your data never leaves your device",
  "Live dashboard, Discord webhooks, performance analytics",
  "Private Discord community + priority support",
];

export function Pricing() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  async function startCheckout(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { url } = await licenseApi.startCheckout(email, origin);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setLoading(false);
    }
  }

  return (
    <section id="pricing" className="relative px-6 py-24 max-w-3xl mx-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
      >
        <div className="h-[420px] w-[420px] rounded-full bg-primary/15 blur-[140px]" />
      </div>
      <div className="text-center mb-10">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">
          Pricing
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Simple, transparent pricing
        </h2>
      </div>
      <div className="bg-card/80 backdrop-blur border border-primary/30 rounded-3xl p-8 md:p-10 shadow-2xl shadow-primary/10">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-5xl md:text-6xl font-bold tracking-tight">$200</span>
          <span className="text-muted-foreground text-sm">first 3 months</span>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Then just <span className="text-foreground font-semibold">$50/mo</span>. Cancel anytime
          after your first 90 days.
        </p>
        <ul className="space-y-3 mb-8 text-sm">
          {INCLUDES.map((line) => (
            <li key={line} className="flex items-start gap-3">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Check className="h-3 w-3" />
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={startCheckout} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-input/40 border border-border rounded-lg px-4 py-3 outline-none focus:border-primary transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground rounded-lg px-6 py-3 font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "Redirecting to Stripe…" : "Get started — start sniping"}
          </button>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <p className="text-xs text-muted-foreground text-center">
            Secure checkout via Stripe. License key is emailed instantly after payment.
          </p>
          <p className="text-xs text-muted-foreground text-center">
            Already a subscriber?{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setLocation("/manage")}
            >
              Manage your license
            </button>
          </p>
        </form>
        <div className="mt-6 pt-6 border-t border-border text-center text-xs text-muted-foreground">
          Runs on your device — no cloud fees, full control.
          <br />
          Need to run on multiple devices? <span className="text-foreground">+$50/mo</span> per
          additional active device.
        </div>
      </div>
    </section>
  );
}
