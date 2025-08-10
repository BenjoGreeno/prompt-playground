import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig(() => {
  const target = process.env.VITE_DEV_PROXY_TARGET || "http://localhost:8001";
  const backendUrl = process.env.REACT_APP_BACKEND_URL; // injected at build via .env or env var
  return {
    plugins: [react()],
    define: {
      "import.meta.env.REACT_APP_BACKEND_URL": JSON.stringify(backendUrl),
    },
    server: {
      port: 3000,
      host: true,
      proxy: {
        "/api": {
          target,
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