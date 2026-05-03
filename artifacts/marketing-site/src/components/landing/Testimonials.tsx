import { Star } from "lucide-react";

const QUOTES = [
  {
    name: "binderking",
    since: "08/2024",
    body: "Hit 12 ETBs on the last Mega Evolution drop while I was at work. Paid for itself in one launch.",
  },
  {
    name: "PullRateAndy",
    since: "11/2023",
    body: "Cleanest UI of any bot I've used. The IMAP integration alone is worth the sub — no more refreshing my inbox.",
  },
  {
    name: "graded.gem",
    since: "03/2024",
    body: "Caught the Topps Chrome restock at Walmart at 2am. Bot did 6/6 checkouts before I even saw the Discord ping.",
  },
  {
    name: "OPCG_Mike",
    since: "06/2024",
    body: "Finally a tool built for cards specifically. Task groups by set is a game changer for One Piece releases.",
  },
  {
    name: "kanto.collector",
    since: "01/2025",
    body: "Support actually answers in Discord. Got onboarded in a day and landed my first Pokémon Center cook the same week.",
  },
  {
    name: "slabsoverresale",
    since: "09/2024",
    body: "Runs quiet in the background on my Mac mini. No cloud nonsense, no monthly proxy gouging. Just works.",
  },
];

function initials(name: string) {
  return name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase();
}

export function Testimonials() {
  return (
    <section className="px-6 py-24 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">
          What hunters are saying
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Trusted by serious collectors
        </h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {QUOTES.map((q) => (
          <div key={q.name} className="bg-card/60 border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm">
                {initials(q.name)}
              </div>
              <div>
                <div className="font-semibold text-sm">{q.name}</div>
                <div className="text-[11px] text-muted-foreground">Member since {q.since}</div>
              </div>
            </div>
            <div className="flex gap-0.5 mb-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />
              ))}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{q.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
