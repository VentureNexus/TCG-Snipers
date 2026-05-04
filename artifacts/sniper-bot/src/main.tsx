import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import { initApiBase, getApiBase } from "@/lib/api-base";
import App from "./App";
import "./index.css";

document.documentElement.classList.add("dark");

async function bootstrap() {
  await initApiBase();

  if (window.electronAPI) {
    setBaseUrl(getApiBase());
  }

  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
