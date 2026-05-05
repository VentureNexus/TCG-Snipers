import React, { useState } from "react";
import { useGetAnalyticsSummary, useListCheckoutResults, useGetCheckoutsOverTime } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RetailerBadge } from "@/components/shared/RetailerBadge";
import { ProductThumbnail } from "@/components/shared/ProductThumbnail";
import { format } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { data: summary } = useGetAnalyticsSummary();
  const { data: checkouts = [] } = useListCheckoutResults({ limit: 10 });
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("week");
  const { data: chartData = [] } = useGetCheckoutsOverTime({ period });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Checkouts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-emerald-400 glow-green">{summary?.totalCheckouts || 0}</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Failures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-red-400">{summary?.totalFailures || 0}</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono glow-blue" style={{ color: "var(--appearance-color)" }}>${summary?.totalSpent || "0.00"}</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-primary">{summary?.successRate ?? 0}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2 glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Checkouts Overview</CardTitle>
            <div className="flex gap-1 bg-muted/30 p-1 rounded-md border border-border/50">
              {(["day", "week", "month", "year"] as const).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-3 capitalize"
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCheckoutsDash" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => {
                    try { return period === 'day' ? format(new Date(val), 'ha') : format(new Date(val), 'MMM d'); } catch(e) { return val; }
                  }} />
                  <YAxis stroke="rgba(255,255,255,0.2)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}
                    itemStyle={{ fontFamily: 'var(--font-mono)' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
                  />
                  <Area type="monotone" dataKey="checkouts" stroke="#34d399" fillOpacity={1} fill="url(#colorCheckoutsDash)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card flex flex-col">
          <CardHeader>
            <CardTitle>Recent Checkouts</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            <div className="space-y-4">
              {checkouts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No recent checkouts</div>
              ) : (
                checkouts.map(co => (
                  <div key={co.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/50">
                    <div className="flex items-center gap-4">
                      <ProductThumbnail
                        src={co.productImage}
                        fallbackUrl={(co as typeof co & { productUrl?: string }).productUrl}
                      />
                      <div>
                        <div className="font-medium text-sm truncate max-w-[120px]">{co.productName}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(co.createdAt), 'MMM d, h:mm a')}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <RetailerBadge retailer={co.retailer} />
                      <div className="font-mono text-sm font-medium text-emerald-400">{co.price || '-'}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
