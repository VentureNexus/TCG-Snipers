import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";

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

  return (
    <div className="max-w-4xl space-y-6">
      {/* Diagnostics always visible — especially important when API is failing */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Diagnostics</CardTitle>
          <CardDescription>
            Real-time request monitoring, latency graphs, and error inspection.
            {typeof window !== "undefined" && window.electronAPI
              ? " Includes server-side metrics from the local API."
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DiagnosticsPanel />
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-muted-foreground p-6">Loading settings…</div>
      ) : (
        <>
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

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg" className="px-8">
              {saving ? "Saving…" : "Save All Settings"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
