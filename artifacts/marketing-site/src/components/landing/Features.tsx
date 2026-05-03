import {
  Radar,
  ShieldCheck,
  Mail,
  Layers,
  Activity,
  Laptop,
} from "lucide-react";

const FEATURES = [
  {
    icon: Radar,
    title: "Multi-retailer monitors",
    body: "Watch Target, Best Buy, Walmart, Amazon, TCGplayer and more in parallel with sub-second alert latency.",
  },
  {
    icon: Layers,
    title: "Task groups",
    body: "Stay organized running dozens of products across multiple sites — group by drop, account, or proxy pool.",
  },
  {
    icon: Mail,
    title: "IMAP email verification",
    body: "Plug in your inbox and the bot pulls verification codes, OTPs, and order confirmations automatically.",
  },
  {
    icon: ShieldCheck,
    title: "Anti-bot evasion",
    body: "In-house fingerprinting, captcha bypass, and rotating residential proxy support keep you under the radar.",
  },
  {
    icon: Activity,
    title: "Live dashboard",
    body: "Real-time task feed, success analytics, and Discord webhooks so every run is fully transparent.",
  },
  {
    icon: Laptop,
    title: "Native desktop app",
    body: "Runs locally on Windows and macOS. Card data is encrypted at rest and never leaves your machine.",
  },
];

export function Features() {
  return (
    <section id="features" className="px-6 py-24 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">
          A seamless experience
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Powerful, intuitive features
        </h2>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
          Everything you need to scale your hauls without scaling complexity.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="bg-card/60 border border-border rounded-2xl p-6 hover:border-primary/40 transition"
          >
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center mb-4">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
