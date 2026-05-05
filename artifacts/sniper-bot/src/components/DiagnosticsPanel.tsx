import React, { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRequestTracker } from "@/hooks/useRequestTracker";
import { useHealthLatency } from "@/hooks/useHealthLatency";
import type { ElectronMetrics } from "@/global";

type Tab = "overview" | "requests" | "errors" | "server";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  POST: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  PATCH: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

function methodBadge(method: string) {
  const cls = METHOD_COLORS[method] ?? "bg-muted/50 text-muted-foreground border-border/50";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${cls}`}>
      {method}
    </span>
  );
}

function statusBadge(status: number | null) {
  if (status === null)
    return <span className="text-[11px] font-mono text-red-400">ERR</span>;
  const cls =
    status < 300
      ? "text-emerald-400"
      : status < 400
      ? "text-blue-400"
      : status < 500
      ? "text-amber-400"
      : "text-red-400";
  return <span className={`text-[11px] font-mono font-semibold ${cls}`}>{status}</span>;
}

function fmtDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtUptime(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function latencyColor(ms: number) {
  if (ms < 50) return "#34d399";
  if (ms < 200) return "#fbbf24";
  return "#f87171";
}

const CustomLatencyDot = (props: {
  cx?: number;
  cy?: number;
  payload?: { durationMs: number };
}) => {
  const { cx, cy, payload } = props;
  if (!cx || !cy || !payload) return null;
  const color = latencyColor(payload.durationMs);
  return <circle cx={cx} cy={cy} r={3} fill={color} stroke="transparent" />;
};

function buildCopyReport(
  entries: ReturnType<typeof useRequestTracker>["entries"],
  serverMetrics: ElectronMetrics | null
): string {
  const lines: string[] = [
    `TCG Snipers Diagnostic Report`,
    `Generated: ${new Date().toISOString()}`,
    `Version: ${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown"}`,
    ``,
  ];

  if (serverMetrics) {
    lines.push(
      `=== Server Status ===`,
      `API alive: ${serverMetrics.alive}`,
      `Port: ${serverMetrics.port}`,
      `Start OK: ${serverMetrics.startOk}`,
      `Uptime: ${fmtUptime(serverMetrics.uptimeMs)}`,
      serverMetrics.startFailReason ? `Start failure: ${serverMetrics.startFailReason}` : "",
      ``
    );
    if (serverMetrics.requests.length > 0) {
      lines.push(`=== Server Requests (last ${serverMetrics.requests.length}) ===`);
      serverMetrics.requests.slice(-30).forEach((r) => {
        lines.push(
          `${fmtTime(r.ts)}  ${r.method.padEnd(6)} ${r.path.padEnd(40)} ${String(r.status ?? "ERR").padStart(3)}  ${fmtDuration(r.durationMs)}`
        );
      });
      lines.push(``);
    }
  }

  const errors = entries.filter((e) => e.isError);
  if (errors.length > 0) {
    lines.push(`=== Client Errors (${errors.length}) ===`);
    errors.slice(-20).forEach((e) => {
      lines.push(
        `${fmtTime(e.ts)}  ${e.method.padEnd(6)} ${e.pathname.padEnd(40)} ${String(e.status ?? "ERR").padStart(3)}  ${fmtDuration(e.durationMs)}  ${e.error ?? ""}`
      );
    });
    lines.push(``);
  }

  if (entries.length > 0) {
    lines.push(`=== Client Requests (last ${Math.min(entries.length, 50)}) ===`);
    entries.slice(-50).forEach((e) => {
      lines.push(
        `${fmtTime(e.ts)}  ${e.method.padEnd(6)} ${e.pathname.padEnd(40)} ${String(e.status ?? "ERR").padStart(3)}  ${fmtDuration(e.durationMs)}`
      );
    });
  }

  return lines.filter((l) => l !== undefined).join("\n");
}

export function DiagnosticsPanel() {
  const { toast } = useToast();
  const { entries, errors, avgLatency, errorRate, clear } = useRequestTracker();
  const healthLatency = useHealthLatency();
  const [tab, setTab] = useState<Tab>("overview");
  const [serverMetrics, setServerMetrics] = useState<ElectronMetrics | null>(null);
  const [showAllRequests, setShowAllRequests] = useState(false);

  const hasElectron = typeof window !== "undefined" && !!window.electronAPI?.diagnostics?.getMetrics;

  const pollMetrics = useCallback(async () => {
    if (!hasElectron) return;
    try {
      const m = await window.electronAPI!.diagnostics!.getMetrics!();
      setServerMetrics(m);
    } catch {
      // best-effort
    }
  }, [hasElectron]);

  useEffect(() => {
    void pollMetrics();
    const id = setInterval(() => void pollMetrics(), 3000);
    return () => clearInterval(id);
  }, [pollMetrics]);

  const handleCopyReport = () => {
    const report = buildCopyReport(entries, serverMetrics);
    navigator.clipboard.writeText(report).then(() => {
      toast({ title: "Diagnostic report copied to clipboard" });
    });
  };

  const isServerAlive = serverMetrics?.alive ?? null;

  const latencyChartData = entries.slice(-60).map((e, i) => ({
    i,
    durationMs: e.durationMs,
    status: e.status,
    isError: e.isError,
    pathname: e.pathname,
    ts: e.ts,
  }));

  const serverLatencyChartData = (serverMetrics?.requests ?? []).slice(-60).map((e, i) => ({
    i,
    durationMs: e.durationMs ?? 0,
    status: e.status,
    isError: (e.status ?? 0) >= 400 || e.error !== null,
    pathname: e.path,
    ts: e.ts,
  }));

  const displayedRequests = showAllRequests
    ? [...entries].reverse()
    : [...entries].reverse().slice(0, 20);

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "requests", label: "Requests", count: entries.length },
    { id: "errors", label: "Errors", count: errors.length },
    ...(hasElectron ? [{ id: "server" as Tab, label: "Server" }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Server health dot (Electron only) */}
          {hasElectron && (
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isServerAlive === null
                    ? "bg-muted-foreground animate-pulse"
                    : isServerAlive
                    ? "bg-emerald-400"
                    : "bg-red-500"
                }`}
              />
              <span className="text-xs text-muted-foreground">
                {isServerAlive === null
                  ? "Checking…"
                  : isServerAlive
                  ? `API :${serverMetrics?.port} · up ${fmtUptime(serverMetrics?.uptimeMs ?? 0)}`
                  : "API server not running"}
              </span>
              {serverMetrics && !serverMetrics.startOk && serverMetrics.startFailReason && (
                <span className="text-xs text-red-400 truncate max-w-xs">
                  — {serverMetrics.startFailReason}
                </span>
              )}
            </div>
          )}
          {/* Metric pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground bg-muted/40 border border-border/40 rounded px-2 py-0.5">
              {entries.length} requests
            </span>
            <span
              className={`text-[11px] rounded px-2 py-0.5 border ${
                errors.length > 0
                  ? "text-red-400 bg-red-500/10 border-red-500/30"
                  : "text-muted-foreground bg-muted/40 border-border/40"
              }`}
            >
              {errors.length} errors {errors.length > 0 && `(${errorRate}%)`}
            </span>
            <span className="text-[11px] text-muted-foreground bg-muted/40 border border-border/40 rounded px-2 py-0.5">
              avg {avgLatency}ms
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" className="text-xs h-7 px-3" onClick={handleCopyReport}>
            Copy Report
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7 px-3" onClick={clear}>
            Clear
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors relative -mb-px ${
              tab === t.id
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 ${
                  t.id === "errors"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-muted/60 text-muted-foreground"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* ── Health Probe Latency ────────────────────────────────────── */}
          {hasElectron && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-2">
                API health probe latency
                {healthLatency.probeCount > 0 && (
                  <span className="ml-1 text-muted-foreground/50">
                    ({healthLatency.probeCount} {healthLatency.probeCount === 1 ? "probe" : "probes"})
                  </span>
                )}
              </p>
              {healthLatency.current === null ? (
                <p className="text-[11px] text-muted-foreground/60 italic">
                  Waiting for first health probe…
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[
                      { label: "Current", value: healthLatency.current },
                      { label: "Avg", value: healthLatency.avg },
                      { label: "Peak", value: healthLatency.max },
                    ].map(({ label, value }) => {
                      const ms = value ?? 0;
                      const color =
                        ms < 500 ? "text-emerald-400" : ms < 2000 ? "text-amber-400" : "text-red-400";
                      return (
                        <div
                          key={label}
                          className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2"
                        >
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                            {label}
                          </p>
                          <p className={`text-sm font-semibold font-mono ${color}`}>
                            {fmtDuration(ms)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {healthLatency.history.length > 1 && (
                    <div className="h-20 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={healthLatency.history.map((r, i) => ({ i, latencyMs: r.latencyMs, ts: r.ts }))}
                          margin={{ top: 2, right: 4, bottom: 0, left: -20 }}
                        >
                          <defs>
                            <linearGradient id="healthLatencyGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="i" hide />
                          <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} width={30} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.[0]) return null;
                              const d = payload[0].payload as { ts: number; latencyMs: number };
                              return (
                                <div className="bg-popover border border-border rounded px-2 py-1.5 text-[11px] space-y-0.5">
                                  <div className="text-muted-foreground">{fmtTime(d.ts)}</div>
                                  <div className="font-mono font-semibold">{fmtDuration(d.latencyMs)}</div>
                                </div>
                              );
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="latencyMs"
                            stroke="#34d399"
                            strokeWidth={1.5}
                            fill="url(#healthLatencyGrad)"
                            dot={false}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Monitoring active — requests will appear here as the app makes API calls.
            </p>
          ) : (
            <>
              <div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Client latency — last {Math.min(entries.length, 60)} requests (ms)
                </p>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={latencyChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="i" hide />
                      <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} width={30} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-popover border border-border rounded px-2 py-1.5 text-[11px] space-y-0.5">
                              <div className="text-muted-foreground">{fmtTime(d.ts)}</div>
                              <div className="font-mono">{d.pathname}</div>
                              <div className="flex gap-2">
                                {statusBadge(d.status)}
                                <span>{fmtDuration(d.durationMs)}</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine y={200} stroke="#f87171" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <Area
                        type="monotone"
                        dataKey="durationMs"
                        stroke="#34d399"
                        strokeWidth={1.5}
                        fill="url(#latencyGrad)"
                        dot={<CustomLatencyDot />}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  Dashed line = 200ms threshold
                </p>
              </div>

              {errors.length > 0 && (
                <div>
                  <p className="text-[11px] text-red-400 mb-2">Recent errors</p>
                  <div className="space-y-1">
                    {errors.slice(-5).reverse().map((e) => (
                      <div
                        key={e.id}
                        className="flex items-start gap-2 text-[11px] font-mono bg-red-500/5 border border-red-500/20 rounded px-2.5 py-1.5"
                      >
                        <span className="text-muted-foreground/60 flex-shrink-0">{fmtTime(e.ts)}</span>
                        {methodBadge(e.method)}
                        <span className="text-foreground/80 truncate flex-1">{e.pathname}</span>
                        {statusBadge(e.status)}
                        <span className="text-muted-foreground flex-shrink-0">{fmtDuration(e.durationMs)}</span>
                        {e.error && (
                          <span className="text-red-400 truncate max-w-[200px]">{e.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Requests Tab ─────────────────────────────────────────────────── */}
      {tab === "requests" && (
        <div className="space-y-2">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No requests captured yet.</p>
          ) : (
            <>
              <div className="space-y-0.5 max-h-96 overflow-y-auto pr-1">
                {displayedRequests.map((e) => (
                  <div
                    key={e.id}
                    className={`flex items-center gap-2 text-[11px] font-mono rounded px-2 py-1 ${
                      e.isError
                        ? "bg-red-500/5 border border-red-500/15"
                        : "bg-muted/20 border border-transparent hover:border-border/30"
                    }`}
                  >
                    <span className="text-muted-foreground/60 flex-shrink-0 w-16 text-right">
                      {fmtTime(e.ts)}
                    </span>
                    <span className="flex-shrink-0">{methodBadge(e.method)}</span>
                    <span className="flex-1 truncate text-foreground/80">{e.pathname}</span>
                    <span className="flex-shrink-0">{statusBadge(e.status)}</span>
                    <span className="text-muted-foreground flex-shrink-0 w-12 text-right">
                      {fmtDuration(e.durationMs)}
                    </span>
                    {e.error && (
                      <span className="text-red-400 truncate max-w-[160px]" title={e.error}>
                        {e.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {entries.length > 20 && (
                <button
                  onClick={() => setShowAllRequests((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center py-1"
                >
                  {showAllRequests
                    ? "Show less"
                    : `Show all ${entries.length} requests`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Errors Tab ───────────────────────────────────────────────────── */}
      {tab === "errors" && (
        <div className="space-y-2">
          {errors.length === 0 ? (
            <p className="text-xs text-emerald-400 py-4 text-center">
              No errors captured — all requests succeeded.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {[...errors].reverse().map((e) => (
                <div
                  key={e.id}
                  className="text-[11px] font-mono bg-red-500/5 border border-red-500/20 rounded px-2.5 py-2 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground/60">{fmtTime(e.ts)}</span>
                    {methodBadge(e.method)}
                    {statusBadge(e.status)}
                    <span className="text-muted-foreground">{fmtDuration(e.durationMs)}</span>
                  </div>
                  <div className="text-foreground/80 truncate">{e.url}</div>
                  {e.error && (
                    <div className="text-red-400 break-all">{e.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Server Tab (Electron only) ────────────────────────────────────── */}
      {tab === "server" && serverMetrics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Status", value: serverMetrics.alive ? "Running" : "Stopped", color: serverMetrics.alive ? "text-emerald-400" : "text-red-400" },
              { label: "Port", value: String(serverMetrics.port), color: "text-foreground" },
              { label: "Uptime", value: fmtUptime(serverMetrics.uptimeMs), color: "text-foreground" },
              { label: "Requests served", value: String(serverMetrics.requests.length), color: "text-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-sm font-semibold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {!serverMetrics.startOk && serverMetrics.startFailReason && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-red-400 font-semibold mb-0.5">Start failure</p>
              <p className="text-[11px] font-mono text-red-300/80 break-all">{serverMetrics.startFailReason}</p>
            </div>
          )}

          {serverMetrics.requests.length > 0 && (
            <>
              <div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Server latency — last {Math.min(serverMetrics.requests.length, 60)} requests (ms)
                </p>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={serverLatencyChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="serverLatencyGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="i" hide />
                      <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} width={30} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-popover border border-border rounded px-2 py-1.5 text-[11px] space-y-0.5">
                              <div className="text-muted-foreground">{fmtTime(d.ts)}</div>
                              <div className="font-mono truncate max-w-[200px]">{d.pathname}</div>
                              <div>{statusBadge(d.status)} {fmtDuration(d.durationMs)}</div>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="durationMs"
                        stroke="#818cf8"
                        strokeWidth={1.5}
                        fill="url(#serverLatencyGrad)"
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <p className="text-[11px] text-muted-foreground mb-2">Recent server requests</p>
                <div className="space-y-0.5 max-h-72 overflow-y-auto pr-1">
                  {[...serverMetrics.requests].reverse().slice(0, 40).map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-center gap-2 text-[11px] font-mono rounded px-2 py-1 ${
                        (r.status ?? 0) >= 400 || r.error
                          ? "bg-red-500/5 border border-red-500/15"
                          : "bg-muted/20 border border-transparent"
                      }`}
                    >
                      <span className="text-muted-foreground/60 flex-shrink-0 w-16 text-right">{fmtTime(r.ts)}</span>
                      <span className="flex-shrink-0">{methodBadge(r.method)}</span>
                      <span className="flex-1 truncate text-foreground/80">{r.path}</span>
                      {statusBadge(r.status)}
                      <span className="text-muted-foreground flex-shrink-0 w-12 text-right">{fmtDuration(r.durationMs)}</span>
                      {r.error && <span className="text-red-400 truncate max-w-[120px]">{r.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
