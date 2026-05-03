const ITEMS = [
  { title: "Mega Evolution 2.5 — Ascended Heroes Booster Bundle", count: "38K+", img: "products/mega-evolution-bundle.webp" },
  { title: "Pokémon First Partner Illustration Collection Series 1", count: "25K+", img: "products/illustration-collection.png" },
  { title: "Mega Evolution Perfect Order Elite Trainer Box", count: "20K+", img: "products/elite-trainer-box.jpg" },
  { title: "Ascended Heroes Mega ex Random Collection Box", count: "13K+", img: "products/random-collection-box.jpg" },
  { title: "2025 Topps Chrome NFL Mega Box", count: "13K+", img: "products/football-mega-box.jpg" },
  { title: "Topps Chrome Football Blaster Box", count: "9K+", img: "products/football-blaster.jpg" },
  { title: "One Piece Card Game OP-09 Booster Display", count: "7K+", img: "products/pirate-booster.jpg" },
  { title: "Lorcana Azurite Sea Booster Box", count: "5K+", img: "products/azurite-sea-booster.webp" },
];

const BASE = import.meta.env.BASE_URL;

export function TrackRecord() {
  return (
    <section className="px-6 py-24 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">
          A proven track record
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Real results from real hunters
        </h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {ITEMS.map((it) => (
          <div
            key={it.title}
            className="bg-card/60 border border-border rounded-2xl p-3 hover:border-primary/40 transition"
          >
            <div className="relative aspect-square rounded-xl overflow-hidden border border-white/5 bg-black/40">
              <img
                src={`${BASE}${it.img}`}
                alt={it.title}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur text-primary text-xs font-bold rounded-md px-2 py-1">
                {it.count} checkouts
              </div>
            </div>
            <p className="text-xs text-foreground mt-3 leading-snug line-clamp-2 px-1 pb-1">
              {it.title}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
