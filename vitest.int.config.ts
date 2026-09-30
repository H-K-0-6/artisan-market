import "dotenv/config";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests run against DATABASE_URL_TEST (a real Postgres database).
// tests/helpers/global-setup.ts applies migrations once per run.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/helpers/global-setup.ts"],
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? "" },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
