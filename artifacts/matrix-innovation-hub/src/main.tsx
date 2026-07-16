import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { captureLaunchToken } from "./lib/matrix-platform";

captureLaunchToken();

createRoot(document.getElementById("root")!).render(<App />);
