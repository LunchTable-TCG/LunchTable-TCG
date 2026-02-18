import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    projects: [
      "convex/vitest.config.ts",
      "packages/engine/vitest.config.ts",
      "apps/web/vitest.config.ts",
    ],
  },
});
