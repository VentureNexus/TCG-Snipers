import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSettings, useUpdateSettings, useListCheckoutResults, getGetSettingsQueryKey, getListCheckoutResultsQueryKey } from "@workspace/api-client-react";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { getApiBase } from "@/lib/api-base";
import { Trash2, Download } from "lucide-react";

const TASK_DEFAULTS_KEY = "task-defaults";

export interface TaskDefaults {
  retryCount: number;
  quantity: number;
  stopAfterMinutes: number;
}

export const DEFAULT_TASK_DEFAULTS: TaskDefaults = {
  retryCount: 3,
  quantity: 1,
  stopAfterMinutes: 0,
};

export function loadTaskDefaults(): TaskDefaults {
  try {
    const raw = localStorage.getItem(TASK_DEFAULTS_KEY);
    if (raw) return { ...DEFAULT_TASK_DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_TASK_DEFAULTS;
}

function saveTaskDefaults(d: TaskDefaults) {
  try { localStorage.setItem(TASK_DEFAULTS_KEY, JSON.stringify(d)); } catch {}
}

interface SettingsForm {
  concurrency: number;
  monitorDelay: number;
  monitorDelayMax: number;
}

const DEFAULT_SETTINGS: SettingsForm = {
  concurrency: 5,
  monitorDelay: 200,
  monitorDelayMax: 800,
};

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<SettingsForm>(DEFAULT_SETTINGS);
  const [formInitialized, setFormInitialized] = useState(false);
  const [discordConnecting, setDiscordConnecting] = useState(false);
  const [taskDefaults, setTaskDefaults] = useState<TaskDefaults>(loadTaskDefaults);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: settingsData, isLoading: loading, isError } = useGetSettings();
  const { data: checkouts = [] } = useListCheckoutResults();
  const updateSettingsMutation = useUpdateSettings();
  const saving = updateSettingsMutation.isPending;

  const isElectron = typeof window !== "undefined" && !!window.electronAPI;
  const discordConnected = !!(settingsData?.discordGuildName || settingsData?.webhookUrl);
  const discordGuildName = settingsData?.discordGuildName ?? null;
  const discordChannelName = settingsData?.discordChannelName ?? null;

  useEffect(() => {
    if (settingsData && !formInitialized) {
      setSettings({
        concurrency: settingsData.concurrency,
        monitorDelay: settingsData.monitorDelay,
        monitorDelayMax: settingsData.monitorDelayMax ?? 800,
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

  const handleDefaultsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTaskDefaults((d) => ({ ...d, [name]: Number(value) }));
  };

  const handleSaveDefaults = () => {
    saveTaskDefaults(taskDefaults);
    toast({ title: "Task Defaults Saved", description: "New tasks will use these defaults." });
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

  const handleDiscordConnect = async () => {
    if (!window.electronAPI?.discord) return;
    setDiscordConnecting(true);
    try {
      const result = await window.electronAPI.discord.connect();
      updateSettingsMutation.mutate(
        { data: { webhookUrl: result.webhookUrl, discordGuildName: result.guildName, discordChannelName: result.channelName } },
        {
          onSuccess: (updated) => {
            queryClient.setQueryData(getGetSettingsQueryKey(), updated);
            toast({ title: "Discord connected", description: `Notifications will be sent to #${result.channelName} in ${result.guildName}.` });
          },
          onError: (err) => {
            toast({ title: "Failed to save Discord connection", description: err instanceof Error ? err.message : "Could not save settings.", variant: "destructive" });
          },
        }
      );
    } catch (err) {
      toast({ title: "Discord connection failed", description: err instanceof Error ? err.message : "Could not connect to Discord.", variant: "destructive" });
    } finally {
      setDiscordConnecting(false);
    }
  };

  const handleDiscordDisconnect = () => {
    updateSettingsMutation.mutate(
      { data: { webhookUrl: "", discordGuildName: null, discordChannelName: null } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetSettingsQueryKey(), updated);
          toast({ title: "Discord disconnected" });
        },
        onError: (err) => {
          toast({ title: "Failed to disconnect", description: err instanceof Error ? err.message : "Could not update settings.", variant: "destructive" });
        },
      }
    );
  };

  const handleExportCsv = () => {
    setExporting(true);
    try {
      const headers = ["ID", "Date", "Product", "Retailer", "Order Number", "Price", "Status", "Error"];
      const rows = checkouts.map((co) => [
        co.id,
        new Date(co.createdAt).toISOString(),
        `"${(co.productName ?? "").replace(/"/g, '""')}"`,
        co.retailer,
        co.orderNumber || "",
        co.price || "",
        co.success ? "Success" : "Failed",
        `"${(co.errorMessage ?? "").replace(/"/g, '""')}"`,
      ]);
      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checkout-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `${checkouts.length} records exported as CSV.` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleClearHistory = async () => {
    if (!clearConfirm) { setClearConfirm(true); return; }
    setClearing(true);
    try {
      await fetch(`${getApiBase()}/api/checkout-results`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: getListCheckoutResultsQueryKey() });
      toast({ title: "History cleared", description: "All checkout records have been deleted." });
      setClearConfirm(false);
    } catch {
      toast({ title: "Failed to clear history", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
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
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Connect Discord to receive checkout alerts in your server.</CardDescription>
            </CardHeader>
            <CardContent>
              {discordConnected ? (
                <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: "rgba(88,101,242,0.35)", background: "rgba(88,101,242,0.08)" }}>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-[#23a55a]" />
                    <span className="text-[#5865F2]"><DiscordIcon /></span>
                    <div>
                      <p className="text-sm font-medium">
                        {discordGuildName ? `${discordGuildName} · #${discordChannelName ?? "unknown"}` : "Connected"}
                      </p>
                      <p className="text-xs text-muted-foreground">Connected via Discord OAuth</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleDiscordDisconnect} disabled={saving} className="text-muted-foreground hover:text-foreground">
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button className="w-full gap-2 text-white" style={{ background: "#5865F2" }} onClick={handleDiscordConnect} disabled={!isElectron || discordConnecting || saving}>
                  <DiscordIcon />
                  {discordConnecting ? "Connecting to Discord…" : "Connect Discord"}
                </Button>
              )}
              {!isElectron && !discordGuildName && (
                <p className="mt-2 text-xs text-muted-foreground text-center">Discord connection is only available in the desktop app.</p>
              )}
            </CardContent>
          </Card>

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
                  <div className="flex items-center gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="monitorDelay">Min Delay (ms)</Label>
                      <Input id="monitorDelay" name="monitorDelay" type="number" min={1} value={settings.monitorDelay} onChange={handleChange} />
                    </div>
                    <span className="mt-5 text-muted-foreground">–</span>
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="monitorDelayMax">Max Delay (ms)</Label>
                      <Input id="monitorDelayMax" name="monitorDelayMax" type="number" min={1} value={settings.monitorDelayMax} onChange={handleChange} />
                    </div>
                  </div>
                  {settings.monitorDelay < 150 && (
                    <p className="text-xs text-amber-400 font-medium">Very low delays can get your IP flagged. We recommend keeping min delay above 150ms.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Recommended: 200–800ms. Values under 150ms may trigger bot detection on some retailers.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Task Defaults</CardTitle>
              <CardDescription>Default values applied when creating a new task. Individual tasks can still override these.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="retryCount">Default Retry Count</Label>
                  <Input id="retryCount" name="retryCount" type="number" min={0} max={20} value={taskDefaults.retryCount} onChange={handleDefaultsChange} />
                  <p className="text-xs text-muted-foreground">How many times to retry if a task fails.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Default Quantity</Label>
                  <Input id="quantity" name="quantity" type="number" min={1} max={10} value={taskDefaults.quantity} onChange={handleDefaultsChange} />
                  <p className="text-xs text-muted-foreground">Number of units to purchase per task.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stopAfterMinutes">Auto-Stop After (min)</Label>
                  <Input id="stopAfterMinutes" name="stopAfterMinutes" type="number" min={0} value={taskDefaults.stopAfterMinutes} onChange={handleDefaultsChange} />
                  <p className="text-xs text-muted-foreground">Stop monitoring after this many minutes. Set 0 to run indefinitely.</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleSaveDefaults}>Save Task Defaults</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Data Management</CardTitle>
              <CardDescription>Export or clear your checkout history.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 bg-muted/10">
                <div>
                  <p className="text-sm font-medium">Checkout History</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{checkouts.length} record{checkouts.length !== 1 ? "s" : ""} stored</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv} disabled={exporting || checkouts.length === 0}>
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-1.5 transition-colors ${clearConfirm ? "border-red-500/50 text-red-400 hover:bg-red-500/10" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={handleClearHistory}
                    disabled={clearing || checkouts.length === 0}
                    onBlur={() => setTimeout(() => setClearConfirm(false), 200)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {clearConfirm ? "Confirm Clear" : "Clear History"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg" className="px-8">
              {saving ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
