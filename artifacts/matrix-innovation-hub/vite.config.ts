import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

// Gateway base path (MAS-001 Gateway-Compatible Applications).
// The public prefix the app may be served beneath by an upstream gateway
// (e.g. /innovation). Derived purely from configuration — never from a
// hostname. GATEWAY_BASE_PATH takes precedence; a non-root BASE_PATH is
// honored as well. "/" or empty means no gateway prefix.
function normalizePrefix(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const gatewayBasePath =
  normalizePrefix(process.env.GATEWAY_BASE_PATH) ||
  normalizePrefix(basePath === "/" ? "" : basePath);

// Exposed to index.html (%VITE_GATEWAY_BASE_PATH%) and import.meta.env.
process.env.VITE_GATEWAY_BASE_PATH = gatewayBasePath;

export default defineConfig(async ({ command }) => ({
  // Production builds emit relative asset URLs; a runtime <base> tag in
  // index.html anchors them to the detected public prefix, so one build
  // works both standalone (/) and beneath a gateway prefix.
  base: command === "build" ? "" : basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
}));
