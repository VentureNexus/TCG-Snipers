import { useState, useEffect, useRef } from "react";
import type { SystemMetrics } from "@/global";

export interface SystemMetricsPoint extends SystemMetrics {
  timestamp: number;
}

export interface UseSystemMetricsResult {
  current: SystemMetrics;
  history: SystemMetricsPoint[];
}

const HISTORY_LENGTH = 60;
const POLL_INTERVAL_MS = 2000;

const ZERO_METRICS: SystemMetrics = {
  cpuPercent: 0,
  ramUsedBytes: 0,
  ramTotalBytes: 0,
  ramPercent: 0,
};

export function useSystemMetrics(): UseSystemMetricsResult {
  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.system;

  const [current, setCurrent] = useState<SystemMetrics>(ZERO_METRICS);
  const [history, setHistory] = useState<SystemMetricsPoint[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isElectron) return;

    const poll = async () => {
      try {
        const metrics = await window.electronAPI!.system!.getMetrics();
        const point: SystemMetricsPoint = { ...metrics, timestamp: Date.now() };
        setCurrent(metrics);
        setHistory((prev) => {
          const next = [...prev, point];
          return next.length > HISTORY_LENGTH ? next.slice(next.length - HISTORY_LENGTH) : next;
        });
      } catch {
        // silently ignore
      }
    };

    void poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isElectron]);

  return { current, history };
}
