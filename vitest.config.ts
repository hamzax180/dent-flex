import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv(): Record<string, string> {
  if (!existsSync(".env")) return {};
  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
  );
}

const env = loadEnv();
const testDb = process.env.TEST_DATABASE_URL ?? env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false, // integration tests share one database
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      ...env,
      // Never run tests against the development or production database.
      DATABASE_URL: testDb ?? "postgresql://invalid/test-db-not-configured",
      APP_SECRET: env.APP_SECRET ?? "test-secret-test-secret-test-secret",
      PROVIDER_WEBHOOK_SECRET: "test-webhook-secret",
      // Tests never call paid AI providers.
      OPENAI_API_KEY: "",
      DEEPSEEK_API_KEY: "",
      CHAT_PROVIDER: "none",
      EMAIL_PROVIDER: "console",
      WHATSAPP_PROVIDER: "console",
      CLINIC_TIMEZONE: "Europe/Istanbul",
    },
  },
});
