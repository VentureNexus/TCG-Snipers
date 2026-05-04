let _cachedBase: string | null = null;
let _isElectron = false;

export async function initApiBase(): Promise<void> {
  if (typeof window !== "undefined" && window.electronAPI?.getApiBaseUrl) {
    _isElectron = true;
    try {
      _cachedBase = await window.electronAPI.getApiBaseUrl();
    } catch (err) {
      console.error(
        "[api-base] Failed to resolve API base URL via Electron IPC. " +
          "The preload bridge may be misconfigured.",
        err,
      );
    }
  }
}

export function getApiBase(): string {
  if (_cachedBase) return _cachedBase;
  if (_isElectron) {
    throw new Error(
      "API base URL was not resolved during bootstrap. " +
        "Ensure initApiBase() is awaited before any API calls.",
    );
  }
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}
