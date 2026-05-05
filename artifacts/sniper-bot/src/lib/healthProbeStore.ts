/**
 * Module-level singleton that holds health-probe latency history.
 * DbErrorBanner is the single source of truth — it calls getHealth() and
 * pushes each successful reading here. DiagnosticsPanel (via useHealthLatency)
 * subscribes to this store so no duplicate polling occurs.
 */

export interface HealthProbeReading {
  ts: number;
  latencyMs: number;
}

const MAX_HISTORY = 60;

let history: HealthProbeReading[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const healthProbeStore = {
  push(latencyMs: number): void {
    const next = [...history, { ts: Date.now(), latencyMs }];
    history = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    notify();
  },

  getSnapshot(): HealthProbeReading[] {
    return history;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
