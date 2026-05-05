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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.20455C17.64 8.56636 17.5827 7.95272 17.4764 7.36364H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20455Z" fill="#4285F4" />
      <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1014 10.2109 14.4205 9 14.4205C6.65591 14.4205 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z" fill="#34A853" />
      <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05" />
      <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z" fill="#EA4335" />
    </svg>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<SettingsForm>(DEFAULT_SETTINGS);
  const [formInitialized, setFormInitialized] = useState(false);
  const [googleConnecting, setGoogleConnecting] = useState(false);

  const { data: settingsData, isLoading: loading, isError } = useGetSettings();
  const updateSettingsMutation = useUpdateSettings();
  const saving = updateSettingsMutation.isPending;

  const isElectron = typeof window !== "undefined" && !!window.electronAPI;
  const googleEmail = settingsData?.googleEmail ?? null;

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

  const handleGoogleSignIn = async () => {
    if (!window.electronAPI?.google) return;
    setGoogleConnecting(true);
    try {
      const result = await window.electronAPI.google.signIn();
      updateSettingsMutation.mutate(
        {
          data: {
            googleEmail: result.email,
            googleAccessToken: result.accessToken,
            googleRefreshToken: result.refreshToken,
            googleTokenExpiry: result.expiresAt,
            imapHost: "imap.gmail.com",
            imapPort: "993",
            imapEmail: result.email,
          },
        },
        {
          onSuccess: (updated) => {
            queryClient.setQueryData(getGetSettingsQueryKey(), updated);
            setSettings((s) => ({
              ...s,
              imapHost: "imap.gmail.com",
              imapPort: "993",
              imapEmail: result.email,
            }));
            toast({
              title: "Google account connected",
              description: `Signed in as ${result.email}. IMAP fields auto-filled.`,
            });
          },
          onError: (err) => {
            toast({
              title: "Failed to save Google credentials",
              description: err instanceof Error ? err.message : "Could not save settings.",
              variant: "destructive",
            });
          },
        }
      );
    } catch (err) {
      toast({
        title: "Google sign-in failed",
        description: err instanceof Error ? err.message : "Could not connect to Google.",
        variant: "destructive",
      });
    } finally {
      setGoogleConnecting(false);
    }
  };

  const handleGoogleDisconnect = () => {
    updateSettingsMutation.mutate(
      {
        data: {
          googleEmail: null,
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiry: null,
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetSettingsQueryKey(), updated);
          toast({ title: "Google account disconnected" });
        },
        onError: (err) => {
          toast({
            title: "Failed to disconnect",
            description: err instanceof Error ? err.message : "Could not update settings.",
            variant: "destructive",
          });
        },
      }
    );
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
              {isElectron && (
                <div>
                  {googleEmail ? (
                    <div className="flex items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <GoogleIcon />
                        <div>
                          <p className="text-sm font-medium">{googleEmail}</p>
                          <p className="text-xs text-muted-foreground">Connected via Google OAuth</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGoogleDisconnect}
                        disabled={saving}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={handleGoogleSignIn}
                      disabled={googleConnecting || saving}
                    >
                      <GoogleIcon />
                      {googleConnecting ? "Connecting to Google…" : "Sign in with Google"}
                    </Button>
                  )}

                  <div className="relative my-5">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or enter manually</span>
                    </div>
                  </div>
                </div>
              )}

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
                  <Label htmlFor="imapPassword">
                    {googleEmail ? "App Password (not used — Google OAuth active)" : "App Password"}
                  </Label>
                  <Input
                    id="imapPassword"
                    name="imapPassword"
                    type="password"
                    value={settings.imapPassword}
                    onChange={handleChange}
                    disabled={!!googleEmail}
                    placeholder={googleEmail ? "Using OAuth token" : ""}
                  />
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
