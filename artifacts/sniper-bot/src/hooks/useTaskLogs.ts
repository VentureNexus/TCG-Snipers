import { useState, useEffect, useRef, useCallback } from "react";

export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export interface TaskLogEntry {
  taskId: number;
  level: LogLevel;
  message: string;
  timestamp: string;
}

export interface UseTaskLogsResult {
  logs: TaskLogEntry[];
  liveStatus: string | null;
  clear: () => void;
  copyLogs: () => void;
}

export function useTaskLogs(taskId: number, enabled: boolean): UseTaskLogsResult {
  const [logs, setLogs] = useState<TaskLogEntry[]>([]);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", taskId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          taskId: number;
          level?: LogLevel;
          message?: string;
          timestamp?: string;
          status?: string;
        };
        if (msg.type === "log" && msg.level && msg.message && msg.timestamp) {
          setLogs((prev) => [
            ...prev,
            {
              taskId: msg.taskId,
              level: msg.level!,
              message: msg.message!,
              timestamp: msg.timestamp!,
            },
          ]);
        } else if (msg.type === "status" && msg.status) {
          setLiveStatus(msg.status);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      // WebSocket error - connection may not be available yet
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [taskId, enabled]);

  const clear = useCallback(() => {
    setLogs([]);
    setLiveStatus(null);
  }, []);

  const copyLogs = useCallback(() => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text).catch(() => {
      // fallback - create temp textarea
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  }, [logs]);

  return { logs, liveStatus, clear, copyLogs };
}
