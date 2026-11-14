import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// En desarrollo (npm run dev) las llamadas a la API se reenvían al backend local.
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8010";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/health": apiTarget,
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
  },
});
