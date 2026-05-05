import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useListTasks,
  useListProfiles,
  useGetAnalyticsSummary,
  getListTasksQueryKey,
  getGetAnalyticsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";

const APP_NAME = "TCG SNIPERS";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/tasks": "Task Manager",
  "/task-groups": "Task Groups",
  "/profiles": "Profiles",
  "/proxies": "Proxies",
  "/analytics": "Analytics",
  "/customization": "App Customization",
  "/settings": "Settings",
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  }
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function metricColorClass(value: number): string {
  if (value >= 80) return "text-red-400";
  if (value >= 60) return "text-yellow-400";
  return "text-emerald-400";
}

function metricDotClass(value: number): string {
  if (value >= 80) return "bg-red-400";
  if (value >= 60) return "bg-yellow-400";
  return "bg-emerald-400";
}

const SESSION_START = Date.now();

export function TopBar() {
  const [location] = useLocation();
  const [time, setTime] = useState(new Date());
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  const { data: tasks = [] } = useListTasks(undefined, {
    query: { refetchInterval: 3000, queryKey: getListTasksQueryKey() },
  });
  const { data: profiles = [] } = useListProfiles();
  const { data: summary } = useGetAnalyticsSummary({
    query: { refetchInterval: 3000, queryKey: getGetAnalyticsSummaryQueryKey() },
  });

  const { current: sysMetrics } = useSystemMetrics();
  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.system;

  const activeTasksCount = tasks.filter(
    (t) => !["idle", "stopped", "failed", "success"].includes(t.status),
  ).length;

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
      setUptimeSeconds(Math.floor((Date.now() - SESSION_START) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const pageTitle = PAGE_TITLES[location] ?? APP_NAME;

  return (
    <header className="h-16 bg-background border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold tracking-tight">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-5 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5" data-testid="stat-active-tasks">
            <span className="text-muted-foreground">Active:</span>
            <span className={`font-mono font-bold ${activeTasksCount > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
              {activeTasksCount}
            </span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5" data-testid="stat-checkouts">
            <span className="text-muted-foreground">Checkouts:</span>
            <span className="font-mono font-bold text-emerald-400">
              {summary?.totalCheckouts ?? 0}
            </span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5" data-testid="stat-failures">
            <span className="text-muted-foreground">Failures:</span>
            <span className={`font-mono font-bold ${(summary?.totalFailures ?? 0) > 0 ? "text-red-400" : "text-muted-foreground"}`}>
              {summary?.totalFailures ?? 0}
            </span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5" data-testid="stat-uptime">
            <span className="text-muted-foreground">Uptime:</span>
            <span className="font-mono text-primary tabular-nums">
              {formatUptime(uptimeSeconds)}
            </span>
          </div>

          {isElectron && (
            <>
              <div className="w-px h-3 bg-border" />
              <div className="flex items-center gap-1.5" data-testid="stat-cpu">
                <span className={`w-1.5 h-1.5 rounded-full ${metricDotClass(sysMetrics.cpuPercent)}`} />
                <span className="text-muted-foreground">CPU:</span>
                <span className={`font-mono font-bold tabular-nums ${metricColorClass(sysMetrics.cpuPercent)}`}>
                  {sysMetrics.cpuPercent}%
                </span>
              </div>
              <div className="w-px h-3 bg-border" />
              <div className="flex items-center gap-1.5" data-testid="stat-ram">
                <span className={`w-1.5 h-1.5 rounded-full ${metricDotClass(sysMetrics.ramPercent)}`} />
                <span className="text-muted-foreground">RAM:</span>
                <span className={`font-mono font-bold tabular-nums ${metricColorClass(sysMetrics.ramPercent)}`}>
                  {sysMetrics.ramPercent}%
                </span>
              </div>
            </>
          )}
        </div>

        <div
          className="font-mono text-primary tabular-nums tracking-wider px-3 py-1 bg-primary/10 rounded border border-primary/20"
          data-testid="clock-display"
        >
          {time.toLocaleTimeString("en-US", { hour12: false })}
        </div>
      </div>
    </header>
  );
}
