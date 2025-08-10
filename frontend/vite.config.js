import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// We load .env and inject REACT_APP_BACKEND_URL into import.meta.env explicitly,
// because Vite only exposes variables with the VITE_ prefix by default.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ""); // load all, including non-VITE_ keys
  const backendUrl = env.REACT_APP_BACKEND_URL || "/api";
  return {
    plugins: [react()],
    define: {
      "import.meta.env.REACT_APP_BACKEND_URL": JSON.stringify(backendUrl),
    },
    server: {
      port: 3000,
      host: true, // 0.0.0.0
      proxy: {
        "/api": {
          target: "http://localhost:8001",
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 3000,
      host: true,
    },
  };
});