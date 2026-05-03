const STATS = [
  { value: "1M+", label: "Successful checkouts secured" },
  { value: "100s", label: "Performance updates shipped" },
  { value: "1000s", label: "Happy hunters in the Discord" },
];

export function StatsBand() {
  return (
    <section className="px-6 py-20 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">
          Unparalleled performance
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          The most effective tool on the market
        </h2>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
          From resellers to lifetime collectors, thousands of hunters trust TCG Snipers to land the
          drops they care about.
        </p>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="bg-gradient-to-b from-card/80 to-card/30 border border-border rounded-2xl p-8 text-center"
          >
            <div className="text-5xl md:text-6xl font-bold text-primary tracking-tight">
              {s.value}
            </div>
            <div className="text-sm text-muted-foreground mt-2">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
