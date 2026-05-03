import { Switch, Route, Router as WouterRouter, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import logoUrl from "@assets/3092-removebg-preview_1777778639894.png";
import Landing from "@/pages/Landing";
import Manage from "@/pages/Manage";
import ManageSession from "@/pages/ManageSession";
import Success from "@/pages/Success";
import Cancel from "@/pages/Cancel";
import Download from "@/pages/Download";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Header() {
  return (
    <header className="border-b border-border/60 bg-card/40 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src={logoUrl} alt="TCG Snipers" className="h-9 w-9 object-contain" />
          <span className="text-xl font-bold tracking-tight">
            <span className="text-primary">TCG</span> Snipers
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition">
            Pricing
          </Link>
          <Link href="/manage" className="text-muted-foreground hover:text-foreground transition">
            Manage license
          </Link>
          <Link
            href="/#pricing"
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 font-semibold hover:opacity-90 transition"
          >
            Start sniping
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 mt-24 bg-card/30">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-sm text-muted-foreground">
        <div>
          <span className="font-bold text-foreground">TCG Snipers</span> &copy; {new Date().getFullYear()}
        </div>
        <div className="flex gap-6">
          <Link href="/manage">Manage license</Link>
          <a href="mailto:support@tcgsnipers.com">Support</a>
        </div>
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
