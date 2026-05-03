const RETAILERS = [
  { name: "Target", region: "US Only" },
  { name: "Walmart", region: "US Only" },
  { name: "Best Buy", region: "US / CA" },
  { name: "Amazon", region: "All Regions" },
  { name: "TCGplayer", region: "US Only" },
  { name: "Pokémon Center", region: "US / EU / JP" },
];

export function RetailersStrip() {
  return (
    <section id="retailers" className="px-6 py-20 max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">
          Supported retailers
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Shop from the biggest names
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {RETAILERS.map((r) => (
          <div
            key={r.name}
            className="bg-card/60 border border-border rounded-2xl p-5 text-center hover:border-primary/40 transition"
          >
            <div className="text-base md:text-lg font-bold tracking-tight">{r.name}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{r.region}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
