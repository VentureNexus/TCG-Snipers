import { useCallback, useEffect, useRef, useState } from "react";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useListTasks, useStopTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MemoryStick } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const RAM_SETTINGS_KEY = "ram-settings";
const DEBOUNCE_MS = 60_000;
const HYSTERESIS_PCT = 5;
const AUTO_STOP_INTERVAL_MS = 3_000;

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
const PRIORITY_SORT: Record<string, number> = { low: 0, normal: 1, high: 2 };

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "high")
    return <span className="text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5">High</span>;
  if (priority === "low")
    return <span className="text-[10px] font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded px-1.5 py-0.5">Low</span>;
  return <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 border border-border rounded px-1.5 py-0.5">Normal</span>;
}

export function RamGuard() {
  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.system;
  const { current } = useSystemMetrics();
  const queryClient = useQueryClient();
  const stopTask = useStopTask();

  const [settings, setSettings] = useState<RamGuardSettings>(loadRamGuardSettings);
  const [dialogOpen, setDialogOpen] = useState(false);
  const nextAlertRef = useRef<number>(0);
  const alertFiredRef = useRef(false);
  const autoStopRunningRef = useRef(false);
  const ramPctRef = useRef(current.ramPercent);
  ramPctRef.current = current.ramPercent;

  const { data: tasks = [] } = useListTasks(undefined, {
    query: { refetchInterval: 3000, queryKey: getListTasksQueryKey() },
  });

  useEffect(() => {
    const handler = () => setSettings(loadRamGuardSettings());
    window.addEventListener("ram-guard-settings-changed", handler);
    return () => window.removeEventListener("ram-guard-settings-changed", handler);
  }, []);

  const runAutoStop = useCallback(
    async (threshold: number) => {
      if (autoStopRunningRef.current) return;
      autoStopRunningRef.current = true;

      const snapshot = [...tasks]
        .filter((t) => RUNNING_STATUSES.has(t.status) && t.priority !== "high")
        .sort((a, b) => (PRIORITY_SORT[a.priority] ?? 1) - (PRIORITY_SORT[b.priority] ?? 1));

      for (const t of snapshot) {
        if (ramPctRef.current < threshold) break;
        await new Promise<void>((resolve) => {
          stopTask.mutate(
            { id: t.id },
            {
              onSettled: () => {
                queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
                resolve();
              },
            },
          );
        });
        await new Promise((r) => setTimeout(r, AUTO_STOP_INTERVAL_MS));
      }

      autoStopRunningRef.current = false;
    },
    [tasks, stopTask, queryClient],
  );

  useEffect(() => {
    if (!isElectron || !settings.enabled) return;

    const ramPct = current.ramPercent;
    const threshold = settings.threshold;

    if (ramPct >= threshold && !alertFiredRef.current && Date.now() >= nextAlertRef.current) {
      alertFiredRef.current = true;
      if (settings.autoStop) {
        void runAutoStop(threshold);
      } else {
        setDialogOpen(true);
      }
    } else if (ramPct < threshold - HYSTERESIS_PCT) {
      alertFiredRef.current = false;
    }
  }, [current.ramPercent, settings, isElectron, runAutoStop]);

  const handleClose = () => {
    nextAlertRef.current = Date.now() + DEBOUNCE_MS;
    setDialogOpen(false);
  };

  if (!isElectron) return null;

  const ramPct = current.ramPercent;
  const usedGb = (current.ramUsedBytes / 1024 ** 3).toFixed(1);
  const totalGb = (current.ramTotalBytes / 1024 ** 3).toFixed(1);

  const runningTasks = [...tasks]
    .filter((t) => RUNNING_STATUSES.has(t.status))
    .sort((a, b) => (PRIORITY_SORT[a.priority] ?? 1) - (PRIORITY_SORT[b.priority] ?? 1));

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <MemoryStick className="w-5 h-5" />
            High RAM Usage
          </DialogTitle>
          <DialogDescription>
            RAM is at{" "}
            <span className="text-primary font-semibold">{Math.round(ramPct)}%</span>{" "}
            ({usedGb} / {totalGb} GB) — above your {settings.threshold}% threshold.
            Consider stopping some tasks to free up memory.
          </DialogDescription>
        </DialogHeader>

        {runningTasks.length > 0 && (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {runningTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/40 border border-border text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PriorityBadge priority={t.priority} />
                  <span className="truncate text-foreground">{t.name}</span>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="shrink-0 h-7 text-xs"
                  onClick={() =>
                    stopTask.mutate(
                      { id: t.id },
                      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) },
                    )
                  }
                >
                  Stop
                </Button>
              </div>
            ))}
          </div>
        )}

        {runningTasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No tasks are currently running.</p>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Dismiss (60s cooldown)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
