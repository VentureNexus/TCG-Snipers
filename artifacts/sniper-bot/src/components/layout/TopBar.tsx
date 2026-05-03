import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListTasks, useListProfiles } from "@workspace/api-client-react";

export function TopBar() {
  const [location] = useLocation();
  const [time, setTime] = useState(new Date());

  const { data: tasks = [] } = useListTasks();
  const { data: profiles = [] } = useListProfiles();

  const activeTasksCount = tasks.filter(t => !['idle', 'stopped', 'failed', 'success'].includes(t.status)).length;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getPageTitle = () => {
    switch (location) {
      case '/': return 'Dashboard';
      case '/tasks': return 'Task Manager';
      case '/task-groups': return 'Task Groups';
      case '/profiles': return 'Profiles';
      case '/proxies': return 'Proxies';
      case '/analytics': return 'Analytics';
      case '/settings': return 'Settings';
      default: return 'SNIPER';
    }
  };

  return (
    <header className="h-14 bg-background border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold tracking-tight">{getPageTitle()}</h1>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Active Tasks:</span>
            <span className="font-mono text-primary">{activeTasksCount}</span>
          </div>
          <div className="w-px h-4 bg-border"></div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Profiles:</span>
            <span className="font-mono">{profiles.length}</span>
          </div>
        </div>

        <div className="font-mono text-primary tabular-nums tracking-wider px-3 py-1 bg-primary/10 rounded border border-primary/20">
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      </div>
    </header>
  );
}
