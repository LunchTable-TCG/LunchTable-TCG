import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["convex/__tests__/**/*.{test,spec}.{js,ts}"],
    environment: "node",
  },
});
