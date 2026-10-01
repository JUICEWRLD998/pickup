import path from "node:path";
import { defineConfig } from "vitest/config";

// "@" is the chatbot app's own alias (tsconfig paths), pointed at the byte-identical copy in this folder.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["poc.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
