import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Match the "@/..." alias from tsconfig so tests import the same way app code does.
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
