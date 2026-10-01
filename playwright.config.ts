import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// E2E runs against a PRODUCTION build (run `npm run build` first) on its own port
// and database, so it never touches your dev data. e2e/prepare-db.mjs recreates
// the database and seeds the demo accounts before the server starts.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
export const E2E_DATABASE_URL =
  process.env.DATABASE_URL_E2E ?? "postgresql://app:app@localhost:5432/artisan_e2e";

export default defineConfig({
  testDir: "e2e",
  // Specs share one database and run in file order (01-, 02-, ...).
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node e2e/prepare-db.mjs && npx tsx server.ts",
    url: `${BASE_URL}/sign-in`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      NODE_ENV: "production",
      PORT: String(PORT),
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      APP_URL: BASE_URL,
      AUTH_RATE_LIMIT: "off",
    },
  },
});
