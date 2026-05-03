import { Link } from "wouter";

export default function Cancel() {
  return (
    <div className="max-w-lg mx-auto px-6 py-24 text-center">
      <h1 className="text-3xl font-bold mb-3">Checkout canceled</h1>
      <p className="text-muted-foreground mb-8">
        No charges made. You can come back any time to start your subscription.
      </p>
      <Link
        href="/"
        className="inline-block bg-primary text-primary-foreground rounded-md px-6 py-3 font-semibold hover:opacity-90 transition"
      >
        Back to pricing
      </Link>
    </div>
  );
}
