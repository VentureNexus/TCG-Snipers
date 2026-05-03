import { Link } from "wouter";
import logoUrl from "@assets/3092-removebg-preview_1777778639894.png";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute left-1/2 top-[-10%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute left-[10%] top-[40%] h-[300px] w-[300px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute right-[5%] top-[20%] h-[340px] w-[340px] rounded-full bg-amber-500/10 blur-[120px]" />
      </div>
      <div className="max-w-5xl mx-auto text-center">
        <img
          src={logoUrl}
          alt="TCG Snipers"
          className="mx-auto h-80 w-80 sm:h-96 sm:w-96 md:h-[28rem] md:w-[28rem] object-contain mb-2 drop-shadow-[0_0_100px_rgba(250,204,21,0.5)]"
        />
        <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-primary border border-primary/30 bg-primary/5 rounded-full px-3 py-1 mb-6">
          Retail automation built for trading-card hunters
        </span>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Tired of watching TCG drops <br className="hidden sm:block" />
          <span className="text-primary">sell out in seconds?</span>
        </h1>
        <p className="text-base md:text-lg text-muted-foreground mt-6 max-w-2xl mx-auto leading-relaxed">
          TCG Snipers automatically monitors and checks out the most in-demand Pokémon, One Piece,
          and Topps drops across every major retailer — so you stop refreshing and start collecting.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="#pricing"
            className="bg-primary text-primary-foreground rounded-lg px-6 py-3 font-semibold hover:opacity-90 transition shadow-lg shadow-primary/20"
          >
            Get started — $200 / 3mo
          </a>
          <Link
            href="/download"
            className="border border-border bg-card/40 rounded-lg px-6 py-3 font-semibold hover:bg-secondary transition"
          >
            Download for Windows &amp; macOS
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-5">
          Desktop software that runs locally on your device — your card data never leaves your machine.
        </p>
      </div>
    </section>
  );
}
