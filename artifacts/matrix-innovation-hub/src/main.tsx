import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { captureLaunchToken } from "./lib/matrix-platform";
import { getBasePath } from "./lib/base-path";

// All generated API client calls (/api/...) are prefixed with the detected
// public base path so they stay beneath the gateway prefix when present.
setBaseUrl(getBasePath() || null);
captureLaunchToken();

createRoot(document.getElementById("root")!).render(<App />);
