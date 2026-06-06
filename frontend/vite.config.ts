import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend dev server runs on 5173 and proxies /api to the backend on 4000,
// so the React code can call "/api/..." without hardcoding the backend host.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
