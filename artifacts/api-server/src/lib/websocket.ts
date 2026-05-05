import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export interface LogMessage {
  type: "log";
  taskId: number;
  level: LogLevel;
  message: string;
  timestamp: string;
  seq: number;
}

export interface StatusMessage {
  type: "status";
  taskId: number;
  status: string;
}

export interface RetryProgressMessage {
  type: "retry_progress";
  taskId: number;
  attempt: number;
  total: number | null;
}

export type WsMessage = LogMessage | StatusMessage | RetryProgressMessage;

const subscribers = new Map<number, Set<WebSocket>>();

const LOG_RING_BUFFER_SIZE = 200;
const logBuffers = new Map<number, LogMessage[]>();
let globalSeq = 0;

const retryProgressCache = new Map<number, RetryProgressMessage>();

const TERMINAL_STATUSES = new Set(["idle", "success", "failed", "stopped"]);

function appendToBuffer(taskId: number, msg: LogMessage): void {
  if (!logBuffers.has(taskId)) {
    logBuffers.set(taskId, []);
  }
  const buf = logBuffers.get(taskId)!;
  buf.push(msg);
  if (buf.length > LOG_RING_BUFFER_SIZE) {
    buf.splice(0, buf.length - LOG_RING_BUFFER_SIZE);
  }
}

export function clearLogBuffer(taskId: number): void {
  logBuffers.delete(taskId);
  retryProgressCache.delete(taskId);
}

export function createWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let subscribedTaskId: number | null = null;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          taskId: number;
          fromSeq?: number;
        };
        if (msg.type === "subscribe" && typeof msg.taskId === "number") {
          if (subscribedTaskId !== null) {
            subscribers.get(subscribedTaskId)?.delete(ws);
          }
          subscribedTaskId = msg.taskId;
          if (!subscribers.has(subscribedTaskId)) {
            subscribers.set(subscribedTaskId, new Set());
          }
          subscribers.get(subscribedTaskId)!.add(ws);

          // Replay buffered log lines the client hasn't seen yet (fromSeq filter)
          const buffered = logBuffers.get(subscribedTaskId);
          if (buffered && buffered.length > 0 && ws.readyState === WebSocket.OPEN) {
            const fromSeq = typeof msg.fromSeq === "number" ? msg.fromSeq : -1;
            for (const entry of buffered) {
              if (entry.seq > fromSeq) {
                ws.send(JSON.stringify(entry));
              }
            }
          }

          // Replay last known retry progress so late-connecting clients see current count
          const cachedRetry = retryProgressCache.get(subscribedTaskId);
          if (cachedRetry && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(cachedRetry));
          }
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (subscribedTaskId !== null) {
        const set = subscribers.get(subscribedTaskId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) subscribers.delete(subscribedTaskId);
        }
      }
    });
  });

  return wss;
}

function sendToTaskSubscribers(taskId: number, payload: WsMessage): void {
  const clients = subscribers.get(taskId);
  if (!clients) return;
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

export function broadcastLog(
  taskId: number,
  level: LogLevel,
  message: string,
): void {
  const logMsg: LogMessage = {
    type: "log",
    taskId,
    level,
    message,
    timestamp: new Date().toISOString(),
    seq: ++globalSeq,
  };
  appendToBuffer(taskId, logMsg);
  sendToTaskSubscribers(taskId, logMsg);
}

export function broadcastStatus(taskId: number, status: string): void {
  if (TERMINAL_STATUSES.has(status)) {
    retryProgressCache.delete(taskId);
  }
  sendToTaskSubscribers(taskId, {
    type: "status",
    taskId,
    status,
  });
}

export function broadcastRetryProgress(taskId: number, attempt: number, total: number | null): void {
  const msg: RetryProgressMessage = { type: "retry_progress", taskId, attempt, total };
  retryProgressCache.set(taskId, msg);
  sendToTaskSubscribers(taskId, msg);
}
