import { Link } from "wouter";

export default function Success() {
  return (
    <div className="max-w-lg mx-auto px-6 py-24 text-center">
      <div className="text-6xl mb-6">🎯</div>
      <h1 className="text-3xl font-bold mb-3">You're in.</h1>
      <p className="text-muted-foreground mb-8">
        Payment received. Your license key is on its way to your inbox — check your email.
      </p>
      <div className="bg-card border border-border rounded-lg p-6 text-left text-sm space-y-3">
        <p className="font-semibold">Next steps</p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Open the email titled "Your TCG Snipers license key".</li>
          <li>
            <Link href="/download" className="text-primary underline">
              Download the desktop app
            </Link>{" "}
            for your OS.
          </li>
          <li>Sign in with your email + license key.</li>
          <li>
            Want to manage your subscription?{" "}
            <Link href="/manage" className="text-primary underline">
              Go to the portal
            </Link>
            .
          </li>
        </ol>
      </div>
    </div>
  );
}
