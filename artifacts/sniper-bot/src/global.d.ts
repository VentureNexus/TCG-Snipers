export {};

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

export interface ServerRequestEntry {
  id: number;
  ts: number;
  method: string;
  path: string;
  status: number | null;
  durationMs: number | null;
  error: string | null;
}

export interface ElectronMetrics {
  requests: ServerRequestEntry[];
  uptimeMs: number;
  alive: boolean;
  port: number;
  startOk: boolean;
  startFailReason: string;
}

export interface SystemMetrics {
  cpuPercent: number;
  ramUsedBytes: number;
  ramTotalBytes: number;
  ramPercent: number;
}

declare global {
  // Build-time constant injected by Vite's `define` in vite.config.ts.
  // Equals the `version` field from package.json at the time of the build.
  const __APP_VERSION__: string;

  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      /** Returns the base URL of the local Express API (derived from API_PORT in electron/main.ts). */
      getApiBaseUrl: () => Promise<string>;
      /** Open a URL in the user's default browser. */
      openExternal: (url: string) => Promise<void>;
      /** Update checker — pings the License API for the latest desktop version. */
      updates: {
        check: () => Promise<UpdateInfo | null>;
        latest: () => Promise<UpdateInfo | null>;
        openDownload: () => Promise<void>;
        onAvailable: (handler: (info: UpdateInfo) => void) => () => void;
        /** Returns the staged update (downloaded + ready to install) if any. */
        downloaded: () => Promise<DownloadedUpdate | null>;
        /** Quit, install the staged update, and relaunch. */
        install: () => Promise<boolean>;
        /** Fires when electron-updater has finished downloading a new version. */
        onDownloaded: (handler: (info: DownloadedUpdate) => void) => () => void;
        /** Fires periodically while a new version is being downloaded. */
        onProgress: (handler: (p: UpdateProgress) => void) => () => void;
      };
      /** In-app diagnostics — API server health, log buffer, and request metrics. */
      diagnostics: {
        getLogs: () => Promise<string[]>;
        getLogFilePath: () => Promise<string>;
        openLogFile: () => Promise<void>;
        getHealth: () => Promise<{ alive: boolean; port: number; latencyMs: number | null }>;
        getStartStatus: () => Promise<{ ok: boolean; reason: string }>;
        getMetrics: () => Promise<ElectronMetrics>;
        onStartFailed: (handler: (info: { reason: string }) => void) => () => void;
        onCrashed: (handler: (info: { reason: string }) => void) => () => void;
        onRecovered: (handler: () => void) => () => void;
      };
      /** License management — Electron secureStorage + machine fingerprint. */
      license: {
        fingerprint: () => Promise<{ fingerprint: string; osPlatform: string }>;
        read: () => Promise<{ token: string; email: string } | null>;
        write: (value: { token: string; email: string }) => Promise<{ ok: true }>;
        clear: () => Promise<{ ok: true }>;
      };
      /** Discord OAuth — opens the browser for channel picker and returns webhook info. */
      discord: {
        connect: () => Promise<{
          webhookUrl: string;
          guildName: string;
          channelName: string;
        }>;
      };
      /** System performance metrics — CPU and RAM usage. */
      system: {
        getMetrics: () => Promise<SystemMetrics>;
      };
    };
  }
}
