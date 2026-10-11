import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(directory, "./src"), "server-only": path.resolve(directory, "./src/test/server-only.ts") } },
  test: {
    environment: "jsdom",
    testTimeout: 30_000,
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/components/ui/**/*.{ts,tsx}",
        "src/features/clients/components/**/*.{ts,tsx}",
        "src/features/clients/lib/**/*.ts",
      ],
      exclude: ["src/**/*.test.{ts,tsx}", "src/components/ui/index.ts"],
      thresholds: { lines: 50, functions: 50, statements: 50, branches: 40 },
    },
  },
});
