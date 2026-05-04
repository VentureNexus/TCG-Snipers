import { useState, useEffect } from "react";

export interface ClientRequestEntry {
  id: number;
  ts: number;
  method: string;
  url: string;
  pathname: string;
  status: number | null;
  durationMs: number;
  error: string | null;
  isError: boolean;
}

const MAX_ENTRIES = 150;

let _entries: ClientRequestEntry[] = [];
let _counter = 0;
let _patched = false;
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

function _add(entry: ClientRequestEntry) {
  _entries = [..._entries.slice(-(MAX_ENTRIES - 1)), entry];
  _notify();
}

function _getPathname(input: RequestInfo | URL): string {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url;
    const url = raw.startsWith("http") ? new URL(raw) : null;
    return url ? url.pathname : raw.split("?")[0];
  } catch {
    return String(input).split("?")[0].slice(0, 80);
  }
}

function _patchFetch() {
  if (_patched || typeof window === "undefined") return;
  _patched = true;
  const original = window.fetch.bind(window);
  window.fetch = async function trackedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const id = ++_counter;
    const ts = Date.now();
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const pathname = _getPathname(input);
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url;
    try {
      const response = await original(input, init);
      const durationMs = Date.now() - ts;
      const isError = response.status >= 400 || !response.ok;
      _add({ id, ts, method, url, pathname, status: response.status, durationMs, error: null, isError });
      return response;
    } catch (err) {
      const durationMs = Date.now() - ts;
      const error = err instanceof Error ? err.message : String(err);
      _add({ id, ts, method, url, pathname, status: null, durationMs, error, isError: true });
      throw err;
    }
  };
}

// Patch immediately on module load so no calls are missed.
if (typeof window !== "undefined") {
  _patchFetch();
}

export function useRequestTracker() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    _patchFetch();
    const fn = () => forceUpdate((n) => n + 1);
    _listeners.add(fn);
    return () => {
      _listeners.delete(fn);
    };
  }, []);

  const entries = _entries;
  const errors = entries.filter((e) => e.isError);
  const recent = entries.slice(-60);
  const avgLatency =
    recent.length > 0
      ? Math.round(recent.reduce((s, e) => s + e.durationMs, 0) / recent.length)
      : 0;
  const errorRate =
    entries.length > 0
      ? Math.round((errors.length / entries.length) * 100)
      : 0;

  function clear() {
    _entries = [];
    _counter = 0;
    _notify();
  }

  return { entries, errors, recent, avgLatency, errorRate, clear };
}
