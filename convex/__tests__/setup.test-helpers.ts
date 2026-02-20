/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "../schema";
import cardsSchema from "../../packages/lunchtable-tcg-cards/src/component/schema";
import matchSchema from "../../packages/lunchtable-tcg-match/src/component/schema";
import storySchema from "../../packages/lunchtable-tcg-story/src/component/schema";
import guildsSchema from "../../packages/lunchtable-tcg-guilds/src/component/schema";

// Host modules — all Convex function files + _generated directory
const modules = import.meta.glob(["../**/*.ts", "!../__tests__/**"]);

// Component modules
const cardsModules = import.meta.glob(
  "../../packages/lunchtable-tcg-cards/src/component/**/*.ts",
);
const matchModules = import.meta.glob(
  "../../packages/lunchtable-tcg-match/src/component/**/*.ts",
);
const storyModules = import.meta.glob(
  "../../packages/lunchtable-tcg-story/src/component/**/*.ts",
);
const guildsModules = import.meta.glob(
  "../../packages/lunchtable-tcg-guilds/src/component/**/*.ts",
);

/**
 * Create a convex-test instance with the host schema and all 4 components registered.
 * Call this at the start of each test — instances are isolated.
 */
export function setupTestConvex() {
  const t = convexTest(schema, modules);
  t.registerComponent("lunchtable_tcg_cards", cardsSchema, cardsModules);
  t.registerComponent("lunchtable_tcg_match", matchSchema, matchModules);
  t.registerComponent("lunchtable_tcg_story", storySchema, storyModules);
  t.registerComponent("lunchtable_tcg_guilds", guildsSchema, guildsModules);
  return t;
}

// ── Test Identities ──────────────────────────────────────────────────
// Privy-style subject strings for withIdentity()

export const ALICE = { name: "Alice", subject: "privy:alice-001" };
export const BOB = { name: "Bob", subject: "privy:bob-002" };
export const CHARLIE = { name: "Charlie", subject: "privy:charlie-003" };

/**
 * Helper: create a user via syncUser and return the authenticated test context.
 * Useful for tests that need a user in the DB before running guarded functions.
 */
export async function seedUser(
  t: ReturnType<typeof setupTestConvex>,
  identity: { name: string; subject: string },
  api: any,
) {
  const asUser = t.withIdentity(identity);
  await asUser.mutation(api.auth.syncUser, {});
  return asUser;
}

/**
 * Helper: seed cards, create Alice, select a starter deck, and return context.
 * Many integration tests need a user with an active deck + resolved user doc.
 */
export async function seedAliceWithDeckAndStats(
  t: ReturnType<typeof setupTestConvex>,
  api: any,
) {
  await t.mutation(api.seed.seedAll, {});
  const asAlice = await seedUser(t, ALICE, api);
  const starters = await t.query(api.game.getStarterDecks, {});
  const { deckId } = await asAlice.mutation(api.game.selectStarterDeck, {
    deckCode: starters[0]!.deckCode,
  });
  const aliceUser = await t.run(async (ctx: any) =>
    ctx.db
      .query("users")
      .withIndex("by_privyId", (q: any) => q.eq("privyId", ALICE.subject))
      .first(),
  );
  return { asAlice, aliceUser, deckId };
}
