import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    concurrency: "50",
    monitorDelay: "3000",
    webhookUrl: "",
    imapHost: "",
    imapPort: "993",
    imapEmail: "",
    imapPassword: ""
  });

  useEffect(() => {
    const saved = localStorage.getItem("sniper_settings");
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(s => ({ ...s, [e.target.name]: e.target.value }));
  };

  const handleSave = () => {
    localStorage.setItem("sniper_settings", JSON.stringify(settings));
    toast({
      title: "Settings Saved",
      description: "Your local settings have been updated.",
    });
  };

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
              <Input id="concurrency" name="concurrency" type="number" value={settings.concurrency} onChange={handleChange} />
              <p className="text-xs text-muted-foreground">Maximum simultaneous requests.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monitorDelay">Default Monitor Delay (ms)</Label>
              <Input id="monitorDelay" name="monitorDelay" type="number" value={settings.monitorDelay} onChange={handleChange} />
              <p className="text-xs text-muted-foreground">Time between stock checks.</p>
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
        <Button onClick={handleSave} size="lg" className="px-8">Save All Settings</Button>
      </div>
    </div>
  );
}
