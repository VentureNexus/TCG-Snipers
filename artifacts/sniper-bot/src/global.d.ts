export {};

declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      /** Returns the base URL of the local Express API, e.g. "http://localhost:8080" */
      getApiBaseUrl: () => Promise<string>;
      /** Open a URL in the user's default browser. */
      openExternal: (url: string) => Promise<void>;
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
