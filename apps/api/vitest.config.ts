import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/regression/*.ts"],
    coverage: {
      provider: "v8",
      include: ["src/sim/**", "src/cli/**"],
      exclude: ["src/regression/**", "**/*.test.ts"],
    },
  },
});
