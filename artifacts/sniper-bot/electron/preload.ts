import { contextBridge, ipcRenderer } from "electron";

interface UpdateInfo {
  current: string;
  latest: string;
  minSupported: string;
  updateAvailable: boolean;
  forceUpdate: boolean;
  downloadUrl: string;
  releaseNotesUrl: string;
  checkedAt: string;
}

interface DownloadedUpdate {
  version: string;
  releaseNotes?: string | null;
  releaseName?: string | null;
  releaseDate?: string;
}

interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

const api = {
  getVersion:    (): Promise<string> => ipcRenderer.invoke("app:version"),
  getPlatform:   (): Promise<string> => ipcRenderer.invoke("app:platform"),
  /** Returns the base URL of the local Express API (e.g. "http://localhost:8080"). */
  getApiBaseUrl: (): Promise<string> => ipcRenderer.invoke("app:apiBaseUrl"),
  openExternal:  (url: string): Promise<void> => ipcRenderer.invoke("app:openExternal", url),

  /** Update checker — pings the License API for the latest desktop version. */
  updates: {
    check: (): Promise<UpdateInfo | null> => ipcRenderer.invoke("update:check"),
    latest: (): Promise<UpdateInfo | null> => ipcRenderer.invoke("update:latest"),
    openDownload: (): Promise<void> => ipcRenderer.invoke("update:openDownload"),
    /** Start the in-app background download (user-initiated). Falls back to browser on unsigned builds. */
    startDownload: (): Promise<boolean> => ipcRenderer.invoke("update:startDownload"),
    onAvailable: (handler: (info: UpdateInfo) => void): (() => void) => {
      const listener = (_e: unknown, info: UpdateInfo) => handler(info);
      ipcRenderer.on("update:available", listener);
      return () => ipcRenderer.removeListener("update:available", listener);
    },
    downloaded: (): Promise<DownloadedUpdate | null> =>
      ipcRenderer.invoke("update:downloaded"),
    install: (): Promise<boolean> => ipcRenderer.invoke("update:install"),
    onDownloaded: (handler: (info: DownloadedUpdate) => void): (() => void) => {
      const listener = (_e: unknown, info: DownloadedUpdate) => handler(info);
      ipcRenderer.on("update:downloaded", listener);
      return () => ipcRenderer.removeListener("update:downloaded", listener);
    },
    onProgress: (handler: (p: UpdateProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: UpdateProgress) => handler(p);
      ipcRenderer.on("update:progress", listener);
      return () => ipcRenderer.removeListener("update:progress", listener);
    },
    /** Returns a pending What's New payload if a fresh update was just installed (one-shot, file deleted after read). */
    getPendingWhatsNew: (): Promise<{ version: string; releaseNotes: string | null } | null> =>
      ipcRenderer.invoke("update:getPendingWhatsNew"),
  },

  /** In-app diagnostics — API server health, log buffer, and request metrics. */
  diagnostics: {
    getLogs: (): Promise<string[]> => ipcRenderer.invoke("api:getLogs"),
    getLogFilePath: (): Promise<string> => ipcRenderer.invoke("api:getLogFilePath"),
    openLogFile: (): Promise<void> => ipcRenderer.invoke("api:openLogFile"),
    getHealth: (): Promise<{ alive: boolean; port: number; latencyMs: number | null }> => ipcRenderer.invoke("api:getHealth"),
    getStartStatus: (): Promise<{ ok: boolean; reason: string }> =>
      ipcRenderer.invoke("api:getStartStatus"),
    getMetrics: (): Promise<{
      requests: Array<{
        id: number; ts: number; method: string; path: string;
        status: number | null; durationMs: number | null; error: string | null;
      }>;
      uptimeMs: number;
      alive: boolean;
      port: number;
      startOk: boolean;
      startFailReason: string;
    }> => ipcRenderer.invoke("api:getMetrics"),
    onStartFailed: (handler: (info: { reason: string }) => void): (() => void) => {
      const listener = (_e: unknown, info: { reason: string }) => handler(info);
      ipcRenderer.on("api:startFailed", listener);
      return () => ipcRenderer.removeListener("api:startFailed", listener);
    },
    onCrashed: (handler: (info: { reason: string }) => void): (() => void) => {
      const listener = (_e: unknown, info: { reason: string }) => handler(info);
      ipcRenderer.on("api:crashed", listener);
      return () => ipcRenderer.removeListener("api:crashed", listener);
    },
    onRecovered: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on("api:recovered", listener);
      return () => ipcRenderer.removeListener("api:recovered", listener);
    },
  },

  /** License management — backed by Electron safeStorage and node:os fingerprinting. */
  license: {
    fingerprint: (): Promise<{ fingerprint: string; osPlatform: string }> =>
      ipcRenderer.invoke("license:fingerprint"),
    read: (): Promise<{ token: string; email: string } | null> =>
      ipcRenderer.invoke("license:read"),
    write: (value: { token: string; email: string }): Promise<{ ok: true }> =>
      ipcRenderer.invoke("license:write", value),
    clear: (): Promise<{ ok: true }> => ipcRenderer.invoke("license:clear"),
  },

  /** Discord OAuth — opens the browser for channel picker and returns webhook info. */
  discord: {
    connect: (): Promise<{
      webhookUrl: string;
      guildName: string;
      channelName: string;
    }> => ipcRenderer.invoke("discord:oauthConnect"),
    cancel: (): Promise<void> => ipcRenderer.invoke("discord:cancelConnect"),
  },

  /** System performance metrics — CPU and RAM usage. */
  system: {
    getMetrics: (): Promise<{
      cpuPercent: number;
      ramUsedBytes: number;
      ramTotalBytes: number;
      ramPercent: number;
    }> => ipcRenderer.invoke("system:getMetrics"),
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

export type ElectronAPI = typeof api;

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
