import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

document.documentElement.classList.add("dark");

async function bootstrap() {
  // When running inside a packaged Electron app the Vite dev-server proxy is
  // not available.  Ask the main process where the local API is and configure
  // the fetch client before mounting React.
  if (window.electronAPI) {
    try {
      const apiBase = await window.electronAPI.getApiBaseUrl();
      setBaseUrl(apiBase);
    } catch {
      // Fallback – should not happen in a correctly packaged build
      setBaseUrl("http://localhost:8080");
    }
  }
  // In the Vite dev-server the /api proxy handles routing; no base URL needed.

  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
