import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");

const readSource = (relativePath: string) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("convex optimization guardrails", () => {
  it("keeps required indexes for runtime efficiency", () => {
    const schemaSource = readSource("convex/schema.ts");
    expect(schemaSource).toContain("matchPresence: defineTable");
    expect(schemaSource).toContain('.index("by_match_user", ["matchId", "userId"])');
    expect(schemaSource).toContain('.index("by_clique", ["cliqueId"])');
    expect(schemaSource).not.toContain("aiTurnQueue: defineTable");
  });

  it("uses direct AI turn scheduling and avoids full card fetches in AI handler", () => {
    const gameSource = readSource("convex/game.ts");

    expect(gameSource).toContain("export const submitAction");
    expect(gameSource).toContain("export const executeAITurn");
    expect(gameSource).toContain("buildCardLookup");
    expect(gameSource).not.toContain("async function queueAITurn");
    expect(gameSource).not.toContain("async function claimQueuedAITurn");
    expect(gameSource).not.toContain("aiTurnQueue");
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
