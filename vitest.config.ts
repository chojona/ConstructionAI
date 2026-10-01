import { defineConfig } from "vitest/config";
import path from "node:path";

const shared = {
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: { environment: "node" as const, restoreMocks: true },
};

export default defineConfig({
  test: {
    projects: [
      { ...shared, test: { ...shared.test, name: "unit", include: ["lib/**/*.test.ts"] } },
      { ...shared, test: { ...shared.test, name: "integration", include: ["tests/integration/**/*.test.ts"] } },
    ],
  },
});
