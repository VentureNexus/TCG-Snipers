import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";

interface SettingsForm {
  concurrency: number;
  monitorDelay: number;
  webhookUrl: string;
  imapHost: string;
  imapPort: string;
  imapEmail: string;
  imapPassword: string;
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
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<SettingsForm>(DEFAULT_SETTINGS);
  const [formInitialized, setFormInitialized] = useState(false);

  const { data: settingsData, isLoading: loading, isError } = useGetSettings();
  const updateSettingsMutation = useUpdateSettings();
  const saving = updateSettingsMutation.isPending;

  const hasElectron = typeof window !== "undefined" && !!window.electronAPI?.diagnostics;
  const [health, setHealth] = useState<{ alive: boolean; port: number } | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLPreElement>(null);
  const logAutoScrollRef = useRef(true);

  useEffect(() => {
    if (settingsData && !formInitialized) {
      setSettings({
        concurrency: settingsData.concurrency,
        monitorDelay: settingsData.monitorDelay,
        webhookUrl: settingsData.webhookUrl,
        imapHost: settingsData.imapHost,
        imapPort: settingsData.imapPort,
        imapEmail: settingsData.imapEmail,
        imapPassword: settingsData.imapPassword,
      });
      setFormInitialized(true);
    }
  }, [settingsData, formInitialized]);

  useEffect(() => {
    if (isError) {
      toast({ title: "Could not load settings", description: "Using defaults.", variant: "destructive" });
    }
  }, [isError]);

  useEffect(() => {
    if (!hasElectron) return;
    const fetchHealth = async () => {
      try {
        const h = await window.electronAPI!.diagnostics!.getHealth();
        setHealth(h);
      } catch {
        setHealth(null);
      }
      setLastChecked(new Date());
    };
    void fetchHealth();
    const id = setInterval(fetchHealth, 5000);
    return () => clearInterval(id);
  }, [hasElectron]);

  useEffect(() => {
    if (!hasElectron) return;
    const pollLogs = async () => {
      try {
        const lines = await window.electronAPI!.diagnostics!.getLogs();
        setLogs(lines);
        if (logAutoScrollRef.current && logsRef.current) {
          logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
      } catch {
        // silently ignore — diagnostics are best-effort
      }
    };
    void pollLogs();
    const id = setInterval(pollLogs, 8000);
    return () => clearInterval(id);
  }, [hasElectron]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setSettings((s) => ({ ...s, [name]: type === "number" ? Number(value) : value }));
  };

  const handleSave = () => {
    updateSettingsMutation.mutate(
      { data: settings },
      {
        onSuccess: (updatedSettings) => {
          queryClient.setQueryData(getGetSettingsQueryKey(), updatedSettings);
          toast({ title: "Settings Saved", description: "Your settings have been persisted to the server." });
        },
        onError: (err) => {
          toast({
            title: "Save Failed",
            description: err instanceof Error ? err.message : "Could not save settings.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleRefreshLogs = async () => {
    if (!hasElectron) return;
    try {
      const lines = await window.electronAPI!.diagnostics!.getLogs();
      setLogs(lines);
      setTimeout(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }, 50);
    } catch {
      // best-effort
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
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-muted-foreground">
                  {health === null
                    ? "Checking API server…"
                    : health.alive
                    ? `API server running on port ${health.port}`
                    : "API server is not running"}
                </span>
                {lastChecked && (
                  <span className="text-[11px] text-muted-foreground/50">
                    Last checked {lastChecked.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleRefreshLogs}>
                Refresh Logs
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
                onScroll={(e) => {
                  const el = e.currentTarget;
                  logAutoScrollRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
                }}
                className="h-64 overflow-y-auto bg-black/40 border border-border/50 rounded-md p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all"
              >
                {logs.join("\n")}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">
                Logs refresh automatically every 8 s. Click "Refresh Logs" to update now.
              </p>
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
