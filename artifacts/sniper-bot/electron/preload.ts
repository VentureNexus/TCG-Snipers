import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  getPlatform: (): Promise<string> => ipcRenderer.invoke("app:platform"),
});

export type ElectronAPI = {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
