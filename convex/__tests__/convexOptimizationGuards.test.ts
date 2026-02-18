import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");

const readSource = (relativePath: string) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("convex optimization guardrails", () => {
  it("keeps queue and index schema required for runtime efficiency", () => {
    const schemaSource = readSource("convex/schema.ts");
    expect(schemaSource).toContain("aiTurnQueue: defineTable");
    expect(schemaSource).toContain('.index("by_matchId", ["matchId"])');
    expect(schemaSource).toContain('.index("by_clique_and_username", ["cliqueId", "username"])');
  });

  it("dedupes AI turn scheduling and avoids full card fetches in AI turn handler", () => {
    const gameSource = readSource("convex/game.ts");

    const submitStart = gameSource.indexOf("export const submitAction");
    const submitEnd = gameSource.indexOf("// ── AI Decision Logic", submitStart);
    const submitActionSource = gameSource.slice(submitStart, submitEnd);
    expect(submitActionSource).toContain("queueAITurn(ctx, args.matchId)");
    expect(submitActionSource).toContain(
      "ctx.scheduler.runAfter(500, internal.game.executeAITurn",
    );

    const aiStart = gameSource.indexOf("export const executeAITurn");
    const aiEnd = gameSource.indexOf("// ── Game View Queries", aiStart);
    const aiTurnSource = gameSource.slice(aiStart, aiEnd);
    expect(aiTurnSource).toContain("claimQueuedAITurn(ctx, args.matchId)");
    expect(aiTurnSource).toContain("getCachedCardLookup(ctx)");
    expect(aiTurnSource.includes("cards.cards.getAllCards")).toBe(false);
  });

  it("collection UIs use optimized card/catalog queries", () => {
    const collectionPage = readSource("apps/web/src/pages/Collection.tsx");
    expect(collectionPage).toContain("apiAny.game.getCatalogCards");
    expect(collectionPage).toContain("apiAny.game.getUserCardCounts");

    const deckBuilderPage = readSource("apps/web/src/pages/DeckBuilder.tsx");
    expect(deckBuilderPage).toContain("apiAny.game.getCatalogCards");
    expect(deckBuilderPage).toContain("apiAny.game.getUserCardCounts");
  });

  it("deck builder initializes local state in effects instead of render", () => {
    const deckBuilderPage = readSource("apps/web/src/pages/DeckBuilder.tsx");
    expect(deckBuilderPage).toContain("const initializedDeckIdRef = useRef<string | null>(null);");
    expect(deckBuilderPage).toContain("useEffect(() => {");
    expect(deckBuilderPage).not.toContain("if (localCards === null && deckData?.cards)");
  });
});
