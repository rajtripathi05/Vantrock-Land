import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // No test may reach the network, an LLM, or a paid API. Enforced by
    // convention here and by review; nothing under tests/ imports a client.
    globals: false,
  },
});
