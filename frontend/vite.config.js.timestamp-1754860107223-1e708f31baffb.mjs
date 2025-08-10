// vite.config.js
import { defineConfig } from "file:///app/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///app/frontend/node_modules/@vitejs/plugin-react/dist/index.mjs";
import dotenv from "dotenv";
dotenv.config();
var vite_config_default = defineConfig(() => {
  const target = process.env.VITE_DEV_PROXY_TARGET || "http://localhost:8001";
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  return {
    plugins: [react()],
    define: {
      "import.meta.env.REACT_APP_BACKEND_URL": JSON.stringify(backendUrl)
    },
    server: {
      port: 3e3,
      host: true,
      proxy: {
        "/api": {
          target,
          changeOrigin: true
        }
      }
    },
    preview: {
      port: 3e3,
      host: true
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvYXBwL2Zyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvYXBwL2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9hcHAvZnJvbnRlbmQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xuaW1wb3J0IGRvdGVudiBmcm9tIFwiZG90ZW52XCI7XG5cbmRvdGVudi5jb25maWcoKTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCgpID0+IHtcbiAgY29uc3QgdGFyZ2V0ID0gcHJvY2Vzcy5lbnYuVklURV9ERVZfUFJPWFlfVEFSR0VUIHx8IFwiaHR0cDovL2xvY2FsaG9zdDo4MDAxXCI7XG4gIGNvbnN0IGJhY2tlbmRVcmwgPSBwcm9jZXNzLmVudi5SRUFDVF9BUFBfQkFDS0VORF9VUkw7IC8vIGluamVjdGVkIGF0IGJ1aWxkIHZpYSAuZW52IG9yIGVudiB2YXJcbiAgcmV0dXJuIHtcbiAgICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gICAgZGVmaW5lOiB7XG4gICAgICBcImltcG9ydC5tZXRhLmVudi5SRUFDVF9BUFBfQkFDS0VORF9VUkxcIjogSlNPTi5zdHJpbmdpZnkoYmFja2VuZFVybCksXG4gICAgfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIHBvcnQ6IDMwMDAsXG4gICAgICBob3N0OiB0cnVlLFxuICAgICAgcHJveHk6IHtcbiAgICAgICAgXCIvYXBpXCI6IHtcbiAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHByZXZpZXc6IHtcbiAgICAgIHBvcnQ6IDMwMDAsXG4gICAgICBob3N0OiB0cnVlLFxuICAgIH0sXG4gIH07XG59KTsiXSwKICAibWFwcGluZ3MiOiAiO0FBQXlOLFNBQVMsb0JBQW9CO0FBQ3RQLE9BQU8sV0FBVztBQUNsQixPQUFPLFlBQVk7QUFFbkIsT0FBTyxPQUFPO0FBRWQsSUFBTyxzQkFBUSxhQUFhLE1BQU07QUFDaEMsUUFBTSxTQUFTLFFBQVEsSUFBSSx5QkFBeUI7QUFDcEQsUUFBTSxhQUFhLFFBQVEsSUFBSTtBQUMvQixTQUFPO0FBQUEsSUFDTCxTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFDakIsUUFBUTtBQUFBLE1BQ04seUNBQXlDLEtBQUssVUFBVSxVQUFVO0FBQUEsSUFDcEU7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQSxRQUNMLFFBQVE7QUFBQSxVQUNOO0FBQUEsVUFDQSxjQUFjO0FBQUEsUUFDaEI7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLElBQ1I7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
