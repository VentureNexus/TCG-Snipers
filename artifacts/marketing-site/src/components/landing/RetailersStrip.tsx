const base = import.meta.env.BASE_URL;

const RETAILERS = [
  { name: "Target", region: "US Only", logo: `${base}retailers/target.png` },
  { name: "Walmart", region: "US Only", logo: `${base}retailers/walmart.png` },
  { name: "Best Buy", region: "US / CA", logo: `${base}retailers/bestbuy.png` },
  { name: "Amazon", region: "All Regions", logo: `${base}retailers/amazon.png` },
  { name: "TCGplayer", region: "US Only", logo: `${base}retailers/tcgplayer.png` },
  { name: "Pokémon Center", region: "US / EU / JP", logo: `${base}retailers/pokemoncenter.png` },
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
            className="bg-card/60 border border-border rounded-2xl p-5 text-center hover:border-primary/40 transition flex flex-col items-center justify-between gap-3 min-h-[140px]"
          >
            <div className="flex-1 flex items-center justify-center w-full">
              <img
                src={r.logo}
                alt={`${r.name} logo`}
                className="max-h-12 w-auto object-contain"
                loading="lazy"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">{r.region}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
