import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,mjs}"],
    exclude: ["tests/integration/**", "tests/compatibility/**"],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/index.ts", "src/version.ts"],
      reporter: ["text", "lcov", "html"],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 80 },
    },
  },
});
