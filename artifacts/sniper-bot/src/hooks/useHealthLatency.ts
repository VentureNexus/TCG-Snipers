import { useSyncExternalStore, useMemo } from "react";
import { healthProbeStore } from "@/lib/healthProbeStore";
import type { HealthProbeReading } from "@/lib/healthProbeStore";

export type { HealthProbeReading };

export interface HealthLatencyStats {
  current: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  history: HealthProbeReading[];
  probeCount: number;
}

export function useHealthLatency(): HealthLatencyStats {
  const history = useSyncExternalStore(
    healthProbeStore.subscribe,
    healthProbeStore.getSnapshot,
    () => [] as HealthProbeReading[],
  );

  return useMemo(() => {
    if (history.length === 0) {
      return { current: null, avg: null, min: null, max: null, history: [], probeCount: 0 };
    }
    const latencies = history.map((r) => r.latencyMs);
    const current = latencies[latencies.length - 1];
    const avg = Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    return { current, avg, min, max, history, probeCount: history.length };
  }, [history]);
}
