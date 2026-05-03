export function FinalCTA() {
  return (
    <section className="px-6 py-24">
      <div className="relative max-w-4xl mx-auto bg-card/70 border border-primary/30 rounded-3xl p-10 md:p-14 text-center overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
        >
          <div className="h-[300px] w-[600px] rounded-full bg-primary/20 blur-[120px]" />
        </div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
          Ready to stop losing drops?
        </h2>
        <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
          Join thousands of TCG hunters who let their machines do the refreshing.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="#pricing"
            className="bg-primary text-primary-foreground rounded-lg px-6 py-3 font-semibold hover:opacity-90 transition shadow-lg shadow-primary/20"
          >
            Get started — $200 / 3mo
          </a>
          <a
            href="https://discord.gg/"
            target="_blank"
            rel="noreferrer"
            className="border border-border bg-card/40 rounded-lg px-6 py-3 font-semibold hover:bg-secondary transition"
          >
            Join the Discord
          </a>
        </div>
      </div>
    </section>
  );
}
