import { contextBridge, ipcRenderer } from "electron";

const api = {
  getVersion:    (): Promise<string> => ipcRenderer.invoke("app:version"),
  getPlatform:   (): Promise<string> => ipcRenderer.invoke("app:platform"),
  /** Returns the base URL of the local Express API (e.g. "http://localhost:8080"). */
  getApiBaseUrl: (): Promise<string> => ipcRenderer.invoke("app:apiBaseUrl"),
  openExternal:  (url: string): Promise<void> => ipcRenderer.invoke("app:openExternal", url),

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
};

contextBridge.exposeInMainWorld("electronAPI", api);

export type ElectronAPI = typeof api;

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
