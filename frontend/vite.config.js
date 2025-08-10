import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load env for proxy target if provided
  const target = process.env.VITE_DEV_PROXY_TARGET || "http://localhost:8001";
  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: true, // 0.0.0.0
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