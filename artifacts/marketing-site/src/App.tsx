import { useState } from "react";
import { Switch, Route, Router as WouterRouter, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";

import logoUrl from "@assets/3092-removebg-preview_1777778639894.png";
import Landing from "@/pages/Landing";
import Manage from "@/pages/Manage";
import ManageSession from "@/pages/ManageSession";
import Success from "@/pages/Success";
import Cancel from "@/pages/Cancel";
import Download from "@/pages/Download";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const HOME_BASE = import.meta.env.BASE_URL;

function anchor(hash: string) {
  return `${HOME_BASE}${hash}`;
}

const NAV_LINKS = [
  { href: anchor("#features"), label: "Features" },
  { href: anchor("#retailers"), label: "Retailers" },
  { href: anchor("#pricing"), label: "Pricing" },
  { href: anchor("#faq"), label: "FAQ" },
];

function AnnouncementBar() {
  return (
    <div className="bg-primary/10 border-b border-primary/20 text-center text-xs py-2 px-4 text-foreground/90">
      <span className="font-semibold text-primary">New:</span> Pokémon Mega Evolution 2.5 module is
      live —{" "}
      <a href={anchor("#features")} className="underline hover:text-primary transition">
        see what's new
      </a>
    </div>
  );
}

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      <AnnouncementBar />
      <header className="border-b border-border/60 bg-background/70 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="TCG Snipers" className="h-12 w-12 object-contain" />
            <span className="text-xl font-bold tracking-tight">
              <span className="text-primary">TCG</span> Snipers
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-muted-foreground hover:text-foreground transition"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/manage"
              className="hidden sm:inline text-muted-foreground hover:text-foreground transition"
            >
              Sign in
            </Link>
            <a
              href={anchor("#pricing")}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 font-semibold hover:opacity-90 transition"
            >
              Get started
            </a>
            <button
              type="button"
              aria-label="Toggle menu"
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden p-2 -mr-2 text-foreground"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur">
            <nav className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-1 text-sm">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="py-2 text-muted-foreground hover:text-foreground transition"
                >
                  {l.label}
                </a>
              ))}
              <Link
                href="/manage"
                onClick={() => setMobileOpen(false)}
                className="py-2 text-muted-foreground hover:text-foreground transition"
              >
                Sign in
              </Link>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 mt-12 bg-card/30">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-sm">
          <div className="flex items-center gap-2">
            <img src={logoUrl} alt="TCG Snipers" className="h-8 w-8 object-contain" />
            <span className="font-bold text-foreground">
              <span className="text-primary">TCG</span> Snipers
            </span>
            <span className="text-muted-foreground ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap gap-6 text-muted-foreground">
            <Link href="/manage" className="hover:text-foreground transition">
              Manage license
            </Link>
            <Link href="/" className="hover:text-foreground transition">
              Home
            </Link>
            <a
              href="https://discord.gg/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition"
            >
              Discord
            </a>
            <a href="mailto:support@tcgsnipers.com" className="hover:text-foreground transition">
              Support
            </a>
            <a href="#" className="hover:text-foreground transition">
              Terms
            </a>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-8 leading-relaxed max-w-3xl">
          All trademarks, logos, and brand names displayed on this website are the property of their
          respective owners. TCG Snipers is not affiliated with, endorsed by, or sponsored by any of
          the retailers shown. Use of these trademarks does not imply any relationship or
          endorsement.
        </p>
      </div>
    </footer>
  );
}

function Router() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/manage" component={Manage} />
          <Route path="/manage/session" component={ManageSession} />
          <Route path="/success" component={Success} />
          <Route path="/cancel" component={Cancel} />
          <Route path="/download" component={Download} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
