import { useEffect, useRef, useState } from "react";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useListTasks, useStopTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { X, MemoryStick } from "lucide-react";

const RAM_SETTINGS_KEY = "ram-guard-settings";
const SNOOZE_DURATION_MS = 5 * 60 * 1000;
const HYSTERESIS_PCT = 5;

export interface RamGuardSettings {
  enabled: boolean;
  threshold: number;
  autoStop: boolean;
}

export const DEFAULT_RAM_GUARD_SETTINGS: RamGuardSettings = {
  enabled: true,
  threshold: 80,
  autoStop: false,
};

export function loadRamGuardSettings(): RamGuardSettings {
  try {
    const raw = localStorage.getItem(RAM_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_RAM_GUARD_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_RAM_GUARD_SETTINGS;
}

export function saveRamGuardSettings(s: RamGuardSettings) {
  try { localStorage.setItem(RAM_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

const RUNNING_STATUSES = new Set(["monitoring", "adding_to_cart", "checking_out"]);
const PRIORITY_ORDER: Record<string, number> = { low: 0, normal: 1, high: 2 };

export function RamGuard() {
  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.system;
  const { current } = useSystemMetrics();
  const queryClient = useQueryClient();
  const stopTask = useStopTask();

  const [settings, setSettings] = useState<RamGuardSettings>(loadRamGuardSettings);
  const [alertOpen, setAlertOpen] = useState(false);
  const snoozedUntilRef = useRef<number>(0);
  const alertFiredRef = useRef(false);
  const autoStoppedIdsRef = useRef<number[]>([]);

  const { data: tasks = [] } = useListTasks(undefined, {
    query: { refetchInterval: alertOpen ? 2000 : 5000, queryKey: getListTasksQueryKey() },
  });

  useEffect(() => {
    const handler = () => setSettings(loadRamGuardSettings());
    window.addEventListener("ram-guard-settings-changed", handler);
    return () => window.removeEventListener("ram-guard-settings-changed", handler);
  }, []);

  useEffect(() => {
    if (!isElectron || !settings.enabled) return;

    const ramPct = current.ramPercent;
    const threshold = settings.threshold;

    if (ramPct >= threshold && !alertFiredRef.current && Date.now() > snoozedUntilRef.current) {
      alertFiredRef.current = true;
      autoStoppedIdsRef.current = [];

      if (settings.autoStop) {
        const running = tasks
          .filter((t) => RUNNING_STATUSES.has(t.status))
          .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));

        for (const t of running) {
          if (t.priority === "high") break;
          autoStoppedIdsRef.current.push(t.id);
          stopTask.mutate(
            { id: t.id },
            { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) },
          );
        }
      }

      setAlertOpen(true);
    } else if (ramPct < threshold - HYSTERESIS_PCT && alertFiredRef.current) {
      alertFiredRef.current = false;
    }
  }, [current.ramPercent, settings, isElectron, tasks, stopTask, queryClient]);

  const handleDismiss = () => {
    snoozedUntilRef.current = Date.now() + SNOOZE_DURATION_MS;
    setAlertOpen(false);
  };

  if (!isElectron || !alertOpen) return null;

  const ramPct = current.ramPercent;
  const usedGb = (current.ramUsedBytes / 1024 ** 3).toFixed(1);
  const totalGb = (current.ramTotalBytes / 1024 ** 3).toFixed(1);
  const runningTasks = tasks.filter((t) => RUNNING_STATUSES.has(t.status));
  const wasAutoStopped = autoStoppedIdsRef.current.length > 0;

  return (
    <div
      role="alert"
      data-testid="ram-guard-banner"
      className="flex flex-col gap-1 px-4 py-2.5 text-sm border-b bg-orange-500/10 border-orange-500/40 text-foreground"
    >
      <div className="flex items-center gap-3">
        <MemoryStick className="w-4 h-4 text-orange-400 shrink-0" />
        <span className="font-semibold text-orange-400">High RAM usage</span>
        <span className="text-muted-foreground">
          {Math.round(ramPct)}% used ({usedGb} / {totalGb} GB) — threshold: {settings.threshold}%
        </span>
        {wasAutoStopped && (
          <span className="text-xs text-orange-300 bg-orange-400/10 border border-orange-400/20 rounded px-2 py-0.5">
            Auto-stopped {autoStoppedIdsRef.current.length} task{autoStoppedIdsRef.current.length !== 1 ? "s" : ""}
          </span>
        )}
        {!wasAutoStopped && runningTasks.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {runningTasks.length} task{runningTasks.length !== 1 ? "s" : ""} running
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-orange-400/70 hover:text-orange-400 transition p-0.5 rounded"
            aria-label="Dismiss for 5 minutes"
            title="Dismiss for 5 minutes"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
