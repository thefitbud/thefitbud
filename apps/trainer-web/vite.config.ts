import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// e2e can run the API on another port (FITBUD_API_PORT / FITBUD_API_URL); default 8787.
const apiTarget =
  process.env.FITBUD_API_URL ??
  `http://127.0.0.1:${process.env.FITBUD_API_PORT ?? "8787"}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
