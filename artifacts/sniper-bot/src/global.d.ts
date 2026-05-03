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

declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      /** Returns the base URL of the local Express API, e.g. "http://localhost:8080" */
      getApiBaseUrl: () => Promise<string>;
      /** Open a URL in the user's default browser. */
      openExternal: (url: string) => Promise<void>;
      /** Update checker — pings the License API for the latest desktop version. */
      updates: {
        check: () => Promise<UpdateInfo | null>;
        latest: () => Promise<UpdateInfo | null>;
        openDownload: () => Promise<void>;
        onAvailable: (handler: (info: UpdateInfo) => void) => () => void;
      };
      /** License management — Electron secureStorage + machine fingerprint. */
      license: {
        fingerprint: () => Promise<{ fingerprint: string; osPlatform: string }>;
        read: () => Promise<{ token: string; email: string } | null>;
        write: (value: { token: string; email: string }) => Promise<{ ok: true }>;
        clear: () => Promise<{ ok: true }>;
      };
    };
  }
}
