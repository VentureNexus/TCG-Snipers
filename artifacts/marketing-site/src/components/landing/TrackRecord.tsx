const ITEMS = [
  { title: "Mega Evolution 2.5 — Ascended Heroes Booster Bundle", count: "38K+", grad: "from-amber-500/40 to-orange-600/30" },
  { title: "Pokémon First Partner Illustration Collection Series 1", count: "25K+", grad: "from-yellow-400/40 to-amber-600/30" },
  { title: "Mega Evolution Perfect Order Elite Trainer Box", count: "20K+", grad: "from-rose-500/40 to-pink-600/30" },
  { title: "Ascended Heroes Mega ex Random Collection Box", count: "13K+", grad: "from-violet-500/40 to-fuchsia-600/30" },
  { title: "2025 Topps Chrome NFL Mega Box", count: "13K+", grad: "from-sky-500/40 to-cyan-600/30" },
  { title: "Topps Chrome Football Blaster Box", count: "9K+", grad: "from-emerald-500/40 to-teal-600/30" },
  { title: "One Piece Card Game OP-09 Booster Display", count: "7K+", grad: "from-red-500/40 to-orange-600/30" },
  { title: "Lorcana Azurite Sea Booster Box", count: "5K+", grad: "from-blue-500/40 to-indigo-600/30" },
];

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
            <div
              className={`aspect-square rounded-xl bg-gradient-to-br ${it.grad} border border-white/5 flex items-end p-3`}
            >
              <div className="bg-black/50 backdrop-blur text-primary text-xs font-bold rounded-md px-2 py-1">
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
