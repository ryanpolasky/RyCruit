import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: false },
      "/assets/": "http://127.0.0.1:3001",
      "/new": "http://127.0.0.1:3001",
      "/i/": { target: "http://127.0.0.1:3001", changeOrigin: false },
      "/ws": { target: "ws://127.0.0.1:3001", ws: true },
    },
  },
});
