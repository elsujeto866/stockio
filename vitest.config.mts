import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Load .env.local into process.env for integration tests.
 *
 * Vite skips .env.local when NODE_ENV === 'test' (by design, to avoid
 * accidentally leaking production secrets). We re-inject it explicitly
 * here so that integration tests that need the real Supabase credentials
 * can access them via process.env.
 *
 * Existing process.env values take precedence (CI can override via system
 * env without touching the local file).
 */
function loadLocalEnv(): Record<string, string> {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return {};

  const vars: Record<string, string> = {};
  const content = readFileSync(envPath, "utf-8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }

  return vars;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Native tsconfig path resolution (replaces the vite-tsconfig-paths plugin).
    // Vite 6 / Vitest 4 support this natively — no plugin needed.
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
    env: loadLocalEnv(),
  },
});
