import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useListTasks,
  useListProfiles,
  useGetAnalyticsSummary,
  getListTasksQueryKey,
  getGetAnalyticsSummaryQueryKey,
} from "@workspace/api-client-react";

const APP_NAME = "TCG SNIPERS";
const APP_VERSION = "v1.0.0";

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

function formatSpent(value: string | number | undefined): string {
  const n = parseFloat(String(value ?? "0"));
  if (isNaN(n)) return "$0.00";
  return "$" + n.toFixed(2);
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
    <header className="h-14 bg-background border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground/50 text-xs font-mono">{APP_VERSION}</span>
        <span className="w-px h-4 bg-border" />
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
          <div className="flex items-center gap-1.5" data-testid="stat-spent">
            <span className="text-muted-foreground">Spent:</span>
            <span className="font-mono font-bold text-amber-400">
              {formatSpent(summary?.totalSpent)}
            </span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5" data-testid="stat-saved">
            <span className="text-muted-foreground">Saved:</span>
            <span className="font-mono font-bold text-amber-400">
              {formatSpent(summary?.totalSaved)}
            </span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5" data-testid="stat-uptime">
            <span className="text-muted-foreground">Uptime:</span>
            <span className="font-mono text-primary tabular-nums">
              {formatUptime(uptimeSeconds)}
            </span>
          </div>
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
