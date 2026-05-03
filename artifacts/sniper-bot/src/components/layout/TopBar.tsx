import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListTasks, useListProfiles } from "@workspace/api-client-react";

const APP_NAME = "SNIPER";
const APP_VERSION = "v1.0.0";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/tasks": "Task Manager",
  "/task-groups": "Task Groups",
  "/profiles": "Profiles",
  "/proxies": "Proxies",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

export function TopBar() {
  const [location] = useLocation();
  const [time, setTime] = useState(new Date());

  const { data: tasks = [] } = useListTasks();
  const { data: profiles = [] } = useListProfiles();

  const activeTasksCount = tasks.filter(
    (t) => !["idle", "stopped", "failed", "success"].includes(t.status)
  ).length;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const pageTitle = PAGE_TITLES[location] ?? APP_NAME;

  return (
    <header className="h-14 bg-background border-b border-border flex items-center justify-between px-6 shrink-0">
      {/* Left: app name + version + page title */}
      <div className="flex items-center gap-3">
        <span className="text-primary font-bold tracking-widest text-sm uppercase">
          {APP_NAME}
        </span>
        <span className="text-muted-foreground/50 text-xs">{APP_VERSION}</span>
        <span className="w-px h-4 bg-border" />
        <h1 className="text-sm font-semibold tracking-tight">{pageTitle}</h1>
      </div>

      {/* Right: live stats + clock */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Active Tasks:</span>
            <span className="font-mono text-primary">{activeTasksCount}</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Profiles:</span>
            <span className="font-mono">{profiles.length}</span>
          </div>
        </div>

        <div className="font-mono text-primary tabular-nums tracking-wider px-3 py-1 bg-primary/10 rounded border border-primary/20">
          {time.toLocaleTimeString("en-US", { hour12: false })}
        </div>
      </div>
    </header>
  );
}
