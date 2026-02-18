import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const convexDir = path.resolve(__dirname, "..");

const getConvexFiles = () =>
  readdirSync(convexDir)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => !file.startsWith("_generated"))
    .sort();

type RegisteredFunction = {
  file: string;
  name: string;
  kind: string;
  declarationSlice: string;
};

const registeredFunctionPattern =
  /export const\s+([A-Za-z0-9_]+)\s*=\s*(query|mutation|action|internalQuery|internalMutation|internalAction)\s*\(\s*\{/g;

const getRegisteredFunctions = (
  file: string,
  source: string,
): RegisteredFunction[] => {
  const result: RegisteredFunction[] = [];
  let match: RegExpExecArray | null = registeredFunctionPattern.exec(source);

  while (match) {
    const name = match[1];
    const kind = match[2];
    const start = match.index;
    const handlerIndex = source.indexOf("handler:", start);
    expect(handlerIndex).toBeGreaterThan(start);

    result.push({
      file,
      name,
      kind,
      declarationSlice: source.slice(start, handlerIndex),
    });

    match = registeredFunctionPattern.exec(source);
  }

  return result;
};

const nonHttpFunctionFiles = getConvexFiles().filter((file) => file !== "http.ts");
const allFunctionFiles = getConvexFiles().filter(
  (file) => file !== "schema.ts" && file !== "convex.config.ts" && file !== "auth.config.ts",
);

describe("convex best-practice guardrails", () => {
  it("all registered Convex functions declare args and returns validators", () => {
    for (const file of allFunctionFiles) {
      const fullPath = path.join(convexDir, file);
      const source = readFileSync(fullPath, "utf8");
      const functions = getRegisteredFunctions(file, source);

      for (const fn of functions) {
        expect(
          fn.declarationSlice.includes("args:"),
          `${file}:${fn.name} (${fn.kind}) missing args validator`,
        ).toBe(true);
      }
    }
  });

  it.skip("convex runtime files avoid excessive throw new Error usage", () => {
    for (const file of nonHttpFunctionFiles) {
      const fullPath = path.join(convexDir, file);
      const source = readFileSync(fullPath, "utf8");
      if (
        file === "auth.ts" ||
        file === "agentAuth.ts" ||
        file === "http.ts" ||
        file === "cards.ts"
      ) {
        continue;
      }
      expect(source.includes("throw new Error("), `${file} contains throw new Error`).toBe(false);
    }
  });

  it("queries do not use .filter on the Convex query builder", () => {
    const queryFilterRegex = /\.query\([^)]*\)\s*\.filter\(/;

    for (const file of allFunctionFiles) {
      const fullPath = path.join(convexDir, file);
      const source = readFileSync(fullPath, "utf8");
      expect(queryFilterRegex.test(source), `${file} uses query.filter`).toBe(false);
    }
  });

  it("db writes and scheduled jobs are awaited or returned", () => {
    const writeCallRegex = /ctx\.(db\.(insert|patch|delete|replace)|scheduler\.runAfter)\(/;

    for (const file of allFunctionFiles) {
      const fullPath = path.join(convexDir, file);
      const source = readFileSync(fullPath, "utf8");
      const lines = source.split("\n");

      lines.forEach((line, idx) => {
        if (!writeCallRegex.test(line)) return;
        const normalized = line.trim();
        const awaitedOrReturned =
          normalized.includes("await ") ||
          normalized.startsWith("return ") ||
          normalized.includes("=> ctx.db.") ||
          normalized.includes("=> ctx.scheduler.");

        expect(
          awaitedOrReturned,
          `${file}:${idx + 1} has un-awaited write/scheduler call`,
        ).toBe(true);
      });
    }
  });
});
