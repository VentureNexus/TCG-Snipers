import React, { useState, useMemo } from "react";
import { useGetAnalyticsSummary, useListCheckoutResults, useGetCheckoutsOverTime } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RetailerBadge } from "@/components/shared/RetailerBadge";
import { format } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink } from "lucide-react";

type SortKey = "createdAt" | "productName" | "retailer" | "price" | "orderNumber" | "success";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="inline ml-1 w-3 h-3 opacity-40" />;
  return sortDir === "asc"
    ? <ChevronUp className="inline ml-1 w-3 h-3 text-primary" />
    : <ChevronDown className="inline ml-1 w-3 h-3 text-primary" />;
}

export default function AnalyticsPage() {
  const { data: summary } = useGetAnalyticsSummary();
  const { data: checkouts = [] } = useListCheckoutResults({ limit: 50 });
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("week");
  const { data: chartData = [] } = useGetCheckoutsOverTime({ period });

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    return [...checkouts].sort((a, b) => {
      let av: string | number | boolean = a[sortKey] ?? "";
      let bv: string | number | boolean = b[sortKey] ?? "";
      if (sortKey === "price") {
        av = parseFloat(String(av)) || 0;
        bv = parseFloat(String(bv)) || 0;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [checkouts, sortKey, sortDir]);

  const th = (label: string, key: SortKey) => (
    <th
      className="px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => handleSort(key)}
    >
      {label}
      <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
    </th>
  );

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
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Saved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-amber-400">${summary?.totalSaved || "0.00"}</div>
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
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorFailures" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.2)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => {
                    try {
                      return period === "day" ? format(new Date(val), "ha") : format(new Date(val), "MMM d");
                    } catch { return val; }
                  }}
                />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}
                  itemStyle={{ fontFamily: "var(--font-mono)" }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "8px" }}
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
                  {th("Date", "createdAt")}
                  {th("Product", "productName")}
                  {th("Retailer", "retailer")}
                  {th("Order Number", "orderNumber")}
                  <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground transition-colors text-right" onClick={() => handleSort("price")}>
                    Price <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} />
                  </th>
                  {th("Status", "success")}
                  <th className="px-4 py-3 font-medium text-center">Order</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No checkouts recorded yet.</td>
                  </tr>
                ) : (
                  sorted.map((co) => (
                    <tr key={co.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(co.createdAt), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {co.productImage && (
                            <img src={co.productImage} alt="" className="w-8 h-8 rounded object-cover bg-muted" />
                          )}
                          <span className="truncate max-w-[200px]" title={co.productName}>{co.productName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RetailerBadge retailer={co.retailer} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {co.orderNumber || "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-primary">
                        {co.price ? `$${co.price}` : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {co.success ? (
                          <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs border border-emerald-400/20">Success</span>
                        ) : (
                          <span className="text-red-400 bg-red-400/10 px-2 py-0.5 rounded text-xs border border-red-400/20">Failed</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {co.success && co.orderNumber ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-primary hover:text-primary"
                            onClick={() => window.open(`https://example.com/orders/${co.orderNumber}`, "_blank")}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View
                          </Button>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
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
