import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // DOM tests need a document/window; jsdom is the lightweight provider.
    environment: "jsdom",
    include: ["test/**/*.test.js"],
    // Tests import explicitly from 'vitest' — no implicit globals.
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      reporter: ["text", "html", "lcov"],
      // Project target: >= 80 % across the implemented core. The UMD
      // environment wrapper in src is excluded via `/* v8 ignore */` because
      // its branches are environment-bound (only one runs per host).
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
});
