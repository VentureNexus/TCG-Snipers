const STEPS = [
  {
    n: "01",
    title: "Watch",
    body: "Drop in product URLs or SKUs, set your size and quantity rules, and let the monitors stay locked on every restock.",
  },
  {
    n: "02",
    title: "Snipe",
    body: "When a drop hits, the bot fires through cart, checkout, and 3DS in parallel across your profiles and proxies.",
  },
  {
    n: "03",
    title: "Ship",
    body: "Confirmations land in your inbox and your Discord — open the box, slab the chase, repeat next week.",
  },
];

export function HowItWorks() {
  return (
    <section className="px-6 py-24 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">
          How it works
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Watch. Snipe. Ship.
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="relative bg-card/60 border border-border rounded-2xl p-7"
          >
            <div className="text-sm font-mono text-primary mb-4">{s.n}</div>
            <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
