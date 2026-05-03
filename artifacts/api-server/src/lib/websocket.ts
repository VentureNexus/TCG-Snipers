import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export interface LogMessage {
  type: "log";
  taskId: number;
  level: LogLevel;
  message: string;
  timestamp: string;
}

export interface StatusMessage {
  type: "status";
  taskId: number;
  status: string;
}

export type WsMessage = LogMessage | StatusMessage;

const subscribers = new Map<number, Set<WebSocket>>();

export function createWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let subscribedTaskId: number | null = null;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          taskId: number;
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
  sendToTaskSubscribers(taskId, {
    type: "log",
    taskId,
    level,
    message,
    timestamp: new Date().toISOString(),
  });
}

export function broadcastStatus(taskId: number, status: string): void {
  sendToTaskSubscribers(taskId, {
    type: "status",
    taskId,
    status,
  });
}
