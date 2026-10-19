/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: the build works from any GitHub Pages sub-path or a plain folder.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1500
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
