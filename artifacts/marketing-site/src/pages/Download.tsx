import { Link } from "wouter";

const INSTALLER_VERSION = "1.0.23";
const GITHUB_RELEASE_BASE =
  `https://github.com/VentureNexus/TCG-Snipers/releases/download/v${INSTALLER_VERSION}`;

const DOWNLOAD_OPTIONS = [
  {
    os: "win" as const,
    label: "Windows",
    sub: "Setup .exe (NSIS)",
    href: `${GITHUB_RELEASE_BASE}/TCGSnipers-Setup-${INSTALLER_VERSION}.exe`,
  },
  {
    os: "mac" as const,
    label: "macOS",
    sub: "DMG (Apple Silicon)",
    href: `${GITHUB_RELEASE_BASE}/TCGSnipers-${INSTALLER_VERSION}-arm64.dmg`,
  },
];

export default function Download() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Download TCG Snipers</h1>
      <p className="text-muted-foreground mb-1">
        Choose your operating system to download the installer.
      </p>
      <p className="text-xs text-muted-foreground mb-8">
        Latest release:{" "}
        <a
          href={`https://github.com/VentureNexus/TCG-Snipers/releases/tag/v${INSTALLER_VERSION}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-foreground underline hover:opacity-80"
        >
          v{INSTALLER_VERSION}
        </a>
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {DOWNLOAD_OPTIONS.map((o) => (
          <a
            key={o.os}
            href={o.href}
            className="bg-card border border-border rounded-xl p-6 text-left hover:border-primary transition"
          >
            <div className="font-semibold text-lg">{o.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{o.sub}</div>
            <div className="text-primary text-sm mt-4">Download →</div>
          </a>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-6">
        You'll need an active subscription to use TCG Snipers.{" "}
        <Link href="/manage" className="underline text-primary">
          Manage your license
        </Link>
        .
      </p>
    </div>
  );
}
