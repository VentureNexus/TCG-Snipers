import { useState } from "react";
import { useLocation } from "wouter";
import { licenseApi } from "@/lib/api";
import logoUrl from "@assets/3092-removebg-preview_1777778639894.png";

const FEATURES = [
  {
    title: "Multi-retailer monitors",
    body: "Watch Target, Best Buy, Walmart, Amazon and more in parallel. Sub-second alert-to-cart latency.",
  },
  {
    title: "Smart checkout pipeline",
    body: "Built-in profile manager, address jig, proxy rotation, and IMAP-driven email verification.",
  },
  {
    title: "Real-time dashboard",
    body: "Live task feed, success analytics, and Discord webhooks so your runs are never a black box.",
  },
  {
    title: "Native desktop app",
    body: "Runs locally on Windows, macOS, and Linux. Your card data stays on your machine, encrypted at rest.",
  },
];

const FAQS = [
  {
    q: "How does pricing work?",
    a: "$200 for the first 3 months gets you onboarded — that's a one-time $150 setup fee plus the $50/mo subscription. After 90 days you're billed $50/mo, cancel anytime.",
  },
  {
    q: "How many devices can I run on?",
    a: "One device per license. You can swap devices yourself any time — sign in to Manage license, release the old one, then activate the new one.",
  },
  {
    q: "Do I need an account on this site?",
    a: "No. Checkout, license delivery, and self-service are all driven by your email. We send a magic link if you ever need to manage your subscription.",
  },
  {
    q: "What happens if my card fails?",
    a: "The desktop app keeps a 5-minute heartbeat with our license server. If your subscription becomes past_due, the bot stops running until you fix the payment.",
  },
];

export default function Landing() {
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
    <div>
      {/* HERO */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto">
          <img
            src={logoUrl}
            alt="TCG Snipers"
            className="mx-auto h-44 w-44 object-contain mb-6 drop-shadow-[0_0_60px_rgba(250,204,21,0.35)]"
          />
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary border border-primary/30 rounded-full px-3 py-1 mb-6">
            Retail automation for trading-card hunters
          </span>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
            Beat the bots.<br />
            <span className="text-primary">Cop the cards.</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-6 max-w-2xl mx-auto">
            TCG Snipers monitors every major retailer for restocks, drops, and DPCI mismatches — and checks
            out automatically with your stored profiles. Built by collectors, for collectors.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#pricing"
              className="bg-primary text-primary-foreground rounded-md px-6 py-3 font-semibold hover:opacity-90 transition"
            >
              Get started — $200 / 3mo
            </a>
            <a
              href="#features"
              className="border border-border rounded-md px-6 py-3 font-semibold hover:bg-secondary transition"
            >
              See features
            </a>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="px-6 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold mb-12 text-center">Built for high-volume hunting</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-primary mb-2">{f.title}</h3>
              <p className="text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="px-6 py-20 max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold mb-4 text-center">One simple plan</h2>
        <p className="text-muted-foreground text-center mb-10">
          $150 one-time setup + $50/mo subscription. Cancel anytime after the first 90 days.
        </p>
        <div className="bg-card border border-primary/30 rounded-2xl p-8 shadow-2xl shadow-primary/10">
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-5xl font-bold">$200</span>
            <span className="text-muted-foreground">first 3 months, then $50/mo</span>
          </div>
          <ul className="space-y-3 mb-8 text-sm">
            {[
              "Unlimited tasks across all supported retailers",
              "Live monitors, captcha bypass, and proxy rotation",
              "Encrypted card vault — your data never leaves your device",
              "Self-service device swap from your dashboard",
              "Discord webhook + analytics dashboard",
              "Priority support via email",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
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
              className="w-full bg-input/40 border border-border rounded-md px-4 py-3 outline-none focus:border-primary transition"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-md px-6 py-3 font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "Redirecting to Stripe…" : "Subscribe — start sniping"}
            </button>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <p className="text-xs text-muted-foreground text-center">
              Secure checkout via Stripe. Your license key is emailed instantly after payment.
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
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold mb-8 text-center">Questions, answered</h2>
        <div className="space-y-4">
          {FAQS.map((f) => (
            <details key={f.q} className="bg-card border border-border rounded-lg p-5 group">
              <summary className="font-semibold cursor-pointer flex items-center justify-between">
                {f.q}
                <span className="text-primary group-open:rotate-45 transition">+</span>
              </summary>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
