import { useState, useEffect } from "react";
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

// ---------------------------------------------------------------------------
// Module-level singleton store — survives component mount/unmount cycles so
// the history buffer is never reset when navigating between pages.
// ---------------------------------------------------------------------------

type Listener = (current: SystemMetrics, history: SystemMetricsPoint[]) => void;

let storeCurrent: SystemMetrics = ZERO_METRICS;
let storeHistory: SystemMetricsPoint[] = [];
const listeners = new Set<Listener>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

function notify() {
  for (const l of listeners) {
    l(storeCurrent, storeHistory);
  }
}

async function poll() {
  try {
    const metrics = await window.electronAPI!.system!.getMetrics();
    const point: SystemMetricsPoint = { ...metrics, timestamp: Date.now() };
    storeCurrent = metrics;
    storeHistory = storeHistory.length >= HISTORY_LENGTH
      ? [...storeHistory.slice(storeHistory.length - HISTORY_LENGTH + 1), point]
      : [...storeHistory, point];
    notify();
  } catch {
    // silently ignore
  }
}

function startPolling() {
  if (pollTimer !== null) return;
  void poll();
  pollTimer = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  subscriberCount++;
  startPolling();

  return () => {
    listeners.delete(listener);
    subscriberCount--;
    if (subscriberCount <= 0) {
      subscriberCount = 0;
      stopPolling();
    }
  };
}

// ---------------------------------------------------------------------------
// Hook — subscribes to the singleton store and re-renders on each update.
// ---------------------------------------------------------------------------

export function useSystemMetrics(): UseSystemMetricsResult {
  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.system;

  const [current, setCurrent] = useState<SystemMetrics>(storeCurrent);
  const [history, setHistory] = useState<SystemMetricsPoint[]>(storeHistory);

  useEffect(() => {
    if (!isElectron) return;

    const unsubscribe = subscribe((c, h) => {
      setCurrent(c);
      setHistory(h);
    });

    // Immediately reflect whatever is already in the store (from prior visits)
    setCurrent(storeCurrent);
    setHistory(storeHistory);

    return unsubscribe;
  }, [isElectron]);

  return { current, history };
}
