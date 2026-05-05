import { useState, useEffect, useRef, useCallback } from "react";
import { getApiBase } from "@/lib/api-base";

export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export interface TaskLogEntry {
  taskId: number;
  level: LogLevel;
  message: string;
  timestamp: string;
  seq: number;
}

export interface RetryProgress {
  attempt: number;
  total: number | null;
}

export interface UseTaskLogsResult {
  logs: TaskLogEntry[];
  liveStatus: string | null;
  retryProgress: RetryProgress | null;
  isReconnecting: boolean;
  clear: () => void;
  copyLogs: () => void;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 500;

function buildWsUrl(): string {
  const apiBase = getApiBase();
  if (apiBase.startsWith("http")) {
    // Electron: api-server URL is absolute — convert http(s) → ws(s)
    return apiBase.replace(/^http/, "ws") + "/ws";
  }
  // Web (Replit dev): apiBase is a path prefix like "/sniper-bot"
  // Include the prefix so Replit's path-based proxy routes it correctly to
  // the Vite dev server, which then proxies /ws → api-server WebSocket.
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${apiBase}/ws`;
}

export function useTaskLogs(taskId: number, enabled: boolean, initialStatus?: string | null): UseTaskLogsResult {
  const [logs, setLogs] = useState<TaskLogEntry[]>([]);
  const [liveStatus, setLiveStatus] = useState<string | null>(initialStatus ?? null);
  const [retryProgress, setRetryProgress] = useState<RetryProgress | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);
  // Tracks the highest seq number received so reconnects only replay missed entries
  const lastSeqRef = useRef(-1);

  const connect = useCallback(() => {
    if (destroyedRef.current) return;

    const wsUrl = buildWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (destroyedRef.current) { ws.close(); return; }
      retryCountRef.current = 0;
      setIsReconnecting(false);
      ws.send(JSON.stringify({ type: "subscribe", taskId, fromSeq: lastSeqRef.current }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          taskId: number;
          level?: LogLevel;
          message?: string;
          timestamp?: string;
          seq?: number;
          status?: string;
          attempt?: number;
          total?: number | null;
        };
        if (msg.type === "log" && msg.level && msg.message && msg.timestamp) {
          const seq = typeof msg.seq === "number" ? msg.seq : -1;
          // Drop entries we have already seen (duplicate guard)
          if (seq <= lastSeqRef.current) return;
          if (seq > lastSeqRef.current) lastSeqRef.current = seq;
          setLogs((prev) => [
            ...prev,
            {
              taskId: msg.taskId,
              level: msg.level!,
              message: msg.message!,
              timestamp: msg.timestamp!,
              seq,
            },
          ]);
        } else if (msg.type === "status" && msg.status) {
          setLiveStatus(msg.status);
          if (["idle", "success", "failed", "stopped"].includes(msg.status)) {
            setRetryProgress(null);
          }
        } else if (msg.type === "retry_progress" && typeof msg.attempt === "number") {
          setRetryProgress({ attempt: msg.attempt, total: msg.total ?? null });
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      // will be followed by onclose — handle reconnect there
    };

    ws.onclose = () => {
      if (destroyedRef.current) return;
      wsRef.current = null;

      if (!enabled) return;

      retryCountRef.current += 1;
      const delay = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, retryCountRef.current - 1),
        MAX_BACKOFF_MS,
      );
      setIsReconnecting(true);
      retryTimerRef.current = setTimeout(connect, delay);
    };
  }, [taskId, enabled]);

  useEffect(() => {
    destroyedRef.current = false;

    if (!enabled) {
      wsRef.current?.close();
      wsRef.current = null;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setIsReconnecting(false);
      retryCountRef.current = 0;
      return;
    }

    connect();

    return () => {
      destroyedRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [taskId, enabled, connect]);

  const clear = useCallback(() => {
    setLogs([]);
    setLiveStatus(null);
    setRetryProgress(null);
    lastSeqRef.current = -1;
  }, []);

  const copyLogs = useCallback(() => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  }, [logs]);

  return { logs, liveStatus, retryProgress, isReconnecting, clear, copyLogs };
}
