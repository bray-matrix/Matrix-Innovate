import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initMatrixLaunchContext } from "./lib/matrix-platform";

initMatrixLaunchContext();

createRoot(document.getElementById("root")!).render(<App />);
