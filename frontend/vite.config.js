import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// No dotenv import needed. Vite automatically loads .env files at project root
// and exposes variables prefixed with REACT_APP_. Our frontend/.env sets
// REACT_APP_BACKEND_URL=/api which gets read at build time.

export default defineConfig({
  plugins: [react()],
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
});