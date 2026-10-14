import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "5173";
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: chromiumExecutable ? { executablePath: chromiumExecutable } : undefined,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER !== "0",
    },
  ],
});
