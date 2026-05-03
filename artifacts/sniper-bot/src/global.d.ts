export {};

declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      /** Returns the base URL of the local Express API, e.g. "http://localhost:8080" */
      getApiBaseUrl: () => Promise<string>;
    };
  }
}
