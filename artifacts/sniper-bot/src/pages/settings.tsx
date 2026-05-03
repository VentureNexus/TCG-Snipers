import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface SettingsForm {
  concurrency: number;
  monitorDelay: number;
  webhookUrl: string;
  imapHost: string;
  imapPort: string;
  imapEmail: string;
  imapPassword: string;
}

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchSettings(): Promise<SettingsForm & { id: number }> {
  const res = await fetch(`${API_BASE}/api/settings`);
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

async function saveSettings(data: SettingsForm): Promise<void> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
}

const DEFAULT_SETTINGS: SettingsForm = {
  concurrency: 5,
  monitorDelay: 3000,
  webhookUrl: "",
  imapHost: "",
  imapPort: "993",
  imapEmail: "",
  imapPassword: "",
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsForm>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasElectron = typeof window !== "undefined" && !!window.electronAPI?.diagnostics;
  const [health, setHealth] = useState<{ alive: boolean; port: number } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const logsRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    fetchSettings()
      .then((data) => {
        setSettings({
          concurrency: data.concurrency,
          monitorDelay: data.monitorDelay,
          webhookUrl: data.webhookUrl,
          imapHost: data.imapHost,
          imapPort: data.imapPort,
          imapEmail: data.imapEmail,
          imapPassword: data.imapPassword,
        });
      })
      .catch(() => {
        toast({ title: "Could not load settings", description: "Using defaults.", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!hasElectron) return;
    const fetchHealth = async () => {
      try {
        const h = await window.electronAPI!.diagnostics!.getHealth();
        setHealth(h);
      } catch {
        setHealth(null);
      }
    };
    void fetchHealth();
    const id = setInterval(fetchHealth, 5000);
    return () => clearInterval(id);
  }, [hasElectron]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setSettings((s) => ({ ...s, [name]: type === "number" ? Number(value) : value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(settings);
      toast({ title: "Settings Saved", description: "Your settings have been persisted to the server." });
    } catch (err) {
      toast({
        title: "Save Failed",
        description: err instanceof Error ? err.message : "Could not save settings.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFetchLogs = async () => {
    if (!hasElectron) return;
    setLoadingLogs(true);
    try {
      const lines = await window.electronAPI!.diagnostics!.getLogs();
      setLogs(lines);
      setTimeout(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }, 50);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleCopyLogs = () => {
    if (logs.length === 0) return;
    navigator.clipboard.writeText(logs.join("\n")).then(() => {
      toast({ title: "Logs copied to clipboard" });
    });
  };

  if (loading) {
    return <div className="text-muted-foreground p-6">Loading settings…</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Engine Settings</CardTitle>
          <CardDescription>Core performance and execution parameters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="concurrency">Global Concurrency Limit</Label>
              <Input id="concurrency" name="concurrency" type="number" min={1} max={50} value={settings.concurrency} onChange={handleChange} />
              <p className="text-xs text-muted-foreground">Maximum simultaneous tasks running at once.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monitorDelay">Default Monitor Delay (ms)</Label>
              <Input id="monitorDelay" name="monitorDelay" type="number" min={500} value={settings.monitorDelay} onChange={handleChange} />
              <p className="text-xs text-muted-foreground">Time between stock checks per task.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Discord webhook integration for successful checkouts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">Discord Webhook URL</Label>
            <Input id="webhookUrl" name="webhookUrl" placeholder="https://discord.com/api/webhooks/..." value={settings.webhookUrl} onChange={handleChange} />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>IMAP Settings</CardTitle>
          <CardDescription>Email connection for automatic OTP interception and order confirmations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="imapHost">IMAP Host</Label>
              <Input id="imapHost" name="imapHost" placeholder="imap.gmail.com" value={settings.imapHost} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imapPort">IMAP Port</Label>
              <Input id="imapPort" name="imapPort" placeholder="993" value={settings.imapPort} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imapEmail">Email Address</Label>
              <Input id="imapEmail" name="imapEmail" type="email" placeholder="bot@example.com" value={settings.imapEmail} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imapPassword">App Password</Label>
              <Input id="imapPassword" name="imapPassword" type="password" value={settings.imapPassword} onChange={handleChange} />
            </div>
          </div>
        </CardContent>
      </Card>

      {hasElectron && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Diagnostics</CardTitle>
            <CardDescription>API server health and process logs for troubleshooting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  health === null
                    ? "bg-muted-foreground"
                    : health.alive
                    ? "bg-emerald-400"
                    : "bg-red-500"
                }`}
              />
              <span className="text-sm text-muted-foreground">
                {health === null
                  ? "Checking API server…"
                  : health.alive
                  ? `API server running on port ${health.port}`
                  : "API server is not running"}
              </span>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleFetchLogs} disabled={loadingLogs}>
                {loadingLogs ? "Loading…" : "Fetch Logs"}
              </Button>
              {logs.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={handleCopyLogs}>
                    Copy Logs
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setLogs([])}>
                    Clear
                  </Button>
                </>
              )}
            </div>

            {logs.length > 0 ? (
              <pre
                ref={logsRef}
                className="h-64 overflow-y-auto bg-black/40 border border-border/50 rounded-md p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all"
              >
                {logs.join("\n")}
              </pre>
            ) : (
              !loadingLogs && (
                <p className="text-xs text-muted-foreground">
                  Click "Fetch Logs" to load recent API server output (last 200 lines).
                </p>
              )
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg" className="px-8">
          {saving ? "Saving…" : "Save All Settings"}
        </Button>
      </div>
    </div>
  );
}
