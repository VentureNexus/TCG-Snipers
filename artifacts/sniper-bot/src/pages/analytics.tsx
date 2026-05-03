import React, { useState } from "react";
import { useGetAnalyticsSummary, useListCheckoutResults, useGetCheckoutsOverTime } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RetailerBadge } from "@/components/shared/RetailerBadge";
import { format } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from "@/components/ui/button";

export default function AnalyticsPage() {
  const { data: summary } = useGetAnalyticsSummary();
  const { data: checkouts = [] } = useListCheckoutResults({ limit: 50 });
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
            <div className="text-2xl font-bold font-mono text-primary glow-blue">${summary?.totalSpent || "0.00"}</div>
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

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Checkouts Over Time</CardTitle>
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
                  <linearGradient id="colorCheckouts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFailures" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => {
                  try {
                    return period === 'day' ? format(new Date(val), 'ha') : format(new Date(val), 'MMM d');
                  } catch(e) { return val; }
                }} />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}
                  itemStyle={{ fontFamily: 'var(--font-mono)' }}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
                />
                <Area type="monotone" dataKey="checkouts" stroke="#34d399" fillOpacity={1} fill="url(#colorCheckouts)" strokeWidth={2} />
                <Area type="monotone" dataKey="failures" stroke="#ef4444" fillOpacity={1} fill="url(#colorFailures)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Checkout History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border border-border/50 rounded-lg overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border/50 text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Retailer</th>
                  <th className="px-4 py-3 font-medium">Order Number</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {checkouts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No checkouts recorded yet.</td>
                  </tr>
                ) : (
                  checkouts.map(co => (
                    <tr key={co.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(co.createdAt), 'yyyy-MM-dd HH:mm')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {co.productImage && <img src={co.productImage} alt="" className="w-8 h-8 rounded object-cover bg-muted" />}
                          <span className="truncate max-w-[250px]" title={co.productName}>{co.productName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RetailerBadge retailer={co.retailer} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {co.orderNumber || '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-primary">
                        {co.price || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {co.success ? (
                           <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs border border-emerald-400/20">Success</span>
                        ) : (
                           <span className="text-red-400 bg-red-400/10 px-2 py-0.5 rounded text-xs border border-red-400/20">Failed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
