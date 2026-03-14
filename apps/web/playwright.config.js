import { defineConfig } from "@playwright/test";
export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 90_000,
    use: {
        baseURL: "http://localhost:5173",
        trace: "on-first-retry",
    },
    webServer: [
        {
            command: "pnpm dev --host 127.0.0.1 --port 5173",
            url: "http://127.0.0.1:5173",
            timeout: 120_000,
            reuseExistingServer: !process.env.CI,
        },
    ],
});
