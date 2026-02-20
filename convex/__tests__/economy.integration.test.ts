/// <reference types="vite/client" />
import { expect, test, describe } from "vitest";
import { api, internal } from "../_generated/api";
import { setupTestConvex, seedUser, ALICE, BOB, CHARLIE } from "./setup.test-helpers";

// ═══════════════════════════════════════════════════════════════════════
// Economy integration tests
// ELO ratings, match history, daily login bonus, pack opening,
// clique bonus, ranked queue, agent stats, and leaderboard.
// ═══════════════════════════════════════════════════════════════════════

// ── ELO Rating System ───────────────────────────────────────────────

describe("ELO rating: updateRatings", () => {
  test("ELO rating update calculates correct changes for new players", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    // Get user IDs
    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });
    const bobUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:bob-002"))
        .first();
    });

    expect(aliceUser).toBeTruthy();
    expect(bobUser).toBeTruthy();

    // Simulate a match: Alice wins over Bob
    const result = await t.mutation(internal.ranked.updateRatings, {
      winnerId: aliceUser!._id,
      loserId: bobUser!._id,
    });

    // Both start at 1000 ELO, K=32 for new players
    // Expected score = 0.5, so winner gets +16, loser gets -16
    expect(result.winnerChange).toBe(16);
    expect(result.loserChange).toBe(-16);
    expect(result.winnerNewRating).toBe(1016);
    expect(result.loserNewRating).toBe(984);
  });

  test("ELO handles asymmetric ratings correctly", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });
    const bobUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:bob-002"))
        .first();
    });

    // First match: Alice wins
    await t.mutation(internal.ranked.updateRatings, {
      winnerId: aliceUser!._id,
      loserId: bobUser!._id,
    });

    // Second match: Bob wins (upset)
    const result2 = await t.mutation(internal.ranked.updateRatings, {
      winnerId: bobUser!._id,
      loserId: aliceUser!._id,
    });

    // Bob was lower rated, so his win gain should be slightly higher
    // Alice was higher rated, so her loss should be slightly bigger
    expect(result2.winnerChange).toBeGreaterThan(0);
    expect(result2.loserChange).toBeLessThan(0);
  });
});

// ── Match History ───────────────────────────────────────────────────

describe("match history", () => {
  test("match history can be recorded after PvP completion", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    await seedUser(t, ALICE, api);
    await seedUser(t, BOB, api);

    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });
    const bobUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:bob-002"))
        .first();
    });

    // Insert match history directly
    await t.run(async (ctx) => {
      await ctx.db.insert("matchHistory", {
        matchId: "test-match-001",
        mode: "pvp",
        winnerId: aliceUser!._id,
        loserId: bobUser!._id,
        winnerRatingBefore: 1000,
        loserRatingBefore: 1000,
        ratingChange: 16,
        duration: 300,
        timestamp: Date.now(),
      });
    });

    // Verify the record exists
    const history = await t.run(async (ctx) => {
      return ctx.db
        .query("matchHistory")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", "test-match-001"))
        .first();
    });

    expect(history).toBeTruthy();
    expect(history!.mode).toBe("pvp");
    expect(history!.winnerId).toBe(aliceUser!._id);
    expect(history!.loserId).toBe(bobUser!._id);
    expect(history!.ratingChange).toBe(16);
  });
});

// ── Daily Login Bonus ───────────────────────────────────────────────

describe("daily login bonus", () => {
  test("daily login bonus awards correct gold (first day: 50g)", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);

    const result = await asAlice.mutation(api.packs.claimDailyBonus, {});

    expect(result.goldAwarded).toBe(50);
    expect(result.newStreak).toBe(1);
  });

  test("daily login bonus cannot be claimed twice in one day", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);

    // First claim succeeds
    await asAlice.mutation(api.packs.claimDailyBonus, {});

    // Second claim should fail
    await expect(
      asAlice.mutation(api.packs.claimDailyBonus, {}),
    ).rejects.toThrow("Daily bonus already claimed today");
  });

  test("daily login streak resets after cycle", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);

    // Bootstrap player stats with a streak of 7
    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });

    // Create stats with streak at 7, last bonus yesterday
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("playerStats", {
        userId: aliceUser!._id,
        gold: 0,
        xp: 0,
        level: 1,
        totalWins: 0,
        totalLosses: 0,
        pvpWins: 0,
        pvpLosses: 0,
        storyWins: 0,
        currentStreak: 0,
        bestStreak: 0,
        totalMatchesPlayed: 0,
        dailyLoginStreak: 7,
        lastLoginBonusAt: yesterday,
        createdAt: Date.now(),
      });
    });

    const result = await asAlice.mutation(api.packs.claimDailyBonus, {});

    // After completing 7-day cycle, streak resets to 1
    expect(result.newStreak).toBe(1);
    expect(result.isStreakReset).toBe(true);
    expect(result.goldAwarded).toBe(50); // Day 1 = 50
  });
});

// ── Pack Opening ────────────────────────────────────────────────────

describe("pack opening", () => {
  test("pack opening deducts gold and grants cards", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);

    // Give Alice enough gold for a basic pack (200g)
    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("playerStats", {
        userId: aliceUser!._id,
        gold: 500,
        xp: 0,
        level: 1,
        totalWins: 0,
        totalLosses: 0,
        pvpWins: 0,
        pvpLosses: 0,
        storyWins: 0,
        currentStreak: 0,
        bestStreak: 0,
        totalMatchesPlayed: 0,
        dailyLoginStreak: 0,
        createdAt: Date.now(),
      });
    });

    const result = await asAlice.mutation(api.packs.openPack, {
      packType: "basic",
    });

    expect(result.goldSpent).toBe(200);
    expect(result.cards).toHaveLength(5); // Basic pack: 5 cards
    for (const card of result.cards) {
      expect(card.cardDefinitionId).toBeTruthy();
      expect(card.name).toBeTruthy();
      expect(card.rarity).toBeTruthy();
    }

    // Check gold was deducted
    const statsAfter = await t.run(async (ctx) => {
      return ctx.db
        .query("playerStats")
        .withIndex("by_userId", (q: any) => q.eq("userId", aliceUser!._id))
        .unique();
    });
    expect(statsAfter!.gold).toBe(300); // 500 - 200
  });

  test("pack opening fails when not enough gold", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);

    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });

    // Give Alice only 50g (not enough for basic pack = 200g)
    await t.run(async (ctx) => {
      await ctx.db.insert("playerStats", {
        userId: aliceUser!._id,
        gold: 50,
        xp: 0,
        level: 1,
        totalWins: 0,
        totalLosses: 0,
        pvpWins: 0,
        pvpLosses: 0,
        storyWins: 0,
        currentStreak: 0,
        bestStreak: 0,
        totalMatchesPlayed: 0,
        dailyLoginStreak: 0,
        createdAt: Date.now(),
      });
    });

    await expect(
      asAlice.mutation(api.packs.openPack, { packType: "basic" }),
    ).rejects.toThrow("Not enough gold");
  });

  test("getPackInfo returns all pack types with prices", async () => {
    const t = setupTestConvex();

    const packs = await t.query(api.packs.getPackInfo, {});

    expect(packs).toHaveLength(3);
    const basicPack = packs.find((p: any) => p.type === "basic");
    expect(basicPack).toBeDefined();
    expect(basicPack!.cost).toBe(200);
    expect(basicPack!.cardCount).toBe(5);

    const premiumPack = packs.find((p: any) => p.type === "premium");
    expect(premiumPack).toBeDefined();
    expect(premiumPack!.cost).toBe(500);

    const legendaryPack = packs.find((p: any) => p.type === "legendary");
    expect(legendaryPack).toBeDefined();
    expect(legendaryPack!.cost).toBe(1500);
    expect(legendaryPack!.cardCount).toBe(3);
  });
});

// ── Clique Bonus ────────────────────────────────────────────────────

describe("clique bonus", () => {
  test("clique bonus applies 10% XP for matching archetype", async () => {
    // Test the pure function directly
    const { calculateCliqueXpBonus } = await import("../cliqueBonus");

    const baseXp = 100;
    const bonus = calculateCliqueXpBonus(baseXp, "dropouts", "dropouts");

    expect(bonus).toBe(10); // 10% of 100
  });

  test("clique bonus returns 0 for non-matching archetype", async () => {
    const { calculateCliqueXpBonus } = await import("../cliqueBonus");

    const bonus = calculateCliqueXpBonus(100, "dropouts", "preps");

    expect(bonus).toBe(0);
  });

  test("clique bonus returns 0 when clique or deck archetype is undefined", async () => {
    const { calculateCliqueXpBonus } = await import("../cliqueBonus");

    expect(calculateCliqueXpBonus(100, undefined, "dropouts")).toBe(0);
    expect(calculateCliqueXpBonus(100, "dropouts", undefined)).toBe(0);
    expect(calculateCliqueXpBonus(100, undefined, undefined)).toBe(0);
  });
});

// ── Ranked Queue ────────────────────────────────────────────────────

describe("ranked queue", () => {
  test("ranked queue join/leave lifecycle", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    const { deckId } = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    // Join queue
    const joinResult = await asAlice.mutation(api.matchmaking.joinRankedQueue, {
      deckId,
    });
    expect(joinResult.queued).toBe(true);
    expect(joinResult.matchId).toBeUndefined();

    // Check queue status
    const status = await asAlice.query(api.matchmaking.getQueueStatus, {});
    expect(status.inQueue).toBe(true);
    expect(status.playersInQueue).toBe(1);

    // Leave queue
    await asAlice.mutation(api.matchmaking.leaveRankedQueue, {});

    // Confirm left
    const statusAfter = await asAlice.query(api.matchmaking.getQueueStatus, {});
    expect(statusAfter.inQueue).toBe(false);
  });

  test("cannot join ranked queue twice", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    const { deckId } = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    await asAlice.mutation(api.matchmaking.joinRankedQueue, { deckId });

    await expect(
      asAlice.mutation(api.matchmaking.joinRankedQueue, { deckId }),
    ).rejects.toThrow("Already in ranked queue");
  });
});

// ── Agent Stats Tracking ────────────────────────────────────────────

describe("agent stats tracking", () => {
  test("agent stats tracking records match results", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);

    // Create an agent for Alice
    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });

    const agentId = await t.run(async (ctx) => {
      return ctx.db.insert("agents", {
        name: "TestBot",
        apiKeyHash: "hash123",
        apiKeyPrefix: "ltcg_",
        userId: aliceUser!._id,
        isActive: true,
        createdAt: Date.now(),
      });
    });

    // Record a win
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 15,
      archetype: "dropouts",
      opponentIsAgent: false,
    });

    // Check stats
    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });

    expect(stats.matchesPlayed).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
    expect(stats.avgTurnsPerMatch).toBe(15);
    expect(stats.agentVsHumanWins).toBe(1);
    expect(stats.agentVsAgentWins).toBe(0);
  });

  test("agent stats accumulate over multiple matches", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    await seedUser(t, ALICE, api);

    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });

    const agentId = await t.run(async (ctx) => {
      return ctx.db.insert("agents", {
        name: "TestBot2",
        apiKeyHash: "hash456",
        apiKeyPrefix: "ltcg_",
        userId: aliceUser!._id,
        isActive: true,
        createdAt: Date.now(),
      });
    });

    // Record 3 matches: 2 wins, 1 loss
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 10,
      opponentIsAgent: false,
    });
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 20,
      opponentIsAgent: true,
    });
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: false,
      turns: 30,
      opponentIsAgent: false,
    });

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });

    expect(stats.matchesPlayed).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.avgTurnsPerMatch).toBe(20); // (10+20+30)/3 = 20
    expect(stats.agentVsHumanWins).toBe(1);
    expect(stats.agentVsHumanLosses).toBe(1);
    expect(stats.agentVsAgentWins).toBe(1);
  });
});

// ── Leaderboard ─────────────────────────────────────────────────────

describe("leaderboard", () => {
  test("leaderboard returns sorted by rating", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    // Set explicit usernames so we can verify sort order
    await asAlice.mutation(api.auth.setUsername, { username: "Alice" });
    await asBob.mutation(api.auth.setUsername, { username: "Bob" });

    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });
    const bobUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:bob-002"))
        .first();
    });

    // Create rating entries with different ratings
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("playerRatings", {
        userId: aliceUser!._id,
        rating: 1200,
        peakRating: 1200,
        tier: "silver",
        gamesPlayed: 10,
        ratingHistory: [],
        updatedAt: now,
        createdAt: now,
      });
      await ctx.db.insert("playerRatings", {
        userId: bobUser!._id,
        rating: 1500,
        peakRating: 1500,
        tier: "platinum",
        gamesPlayed: 15,
        ratingHistory: [],
        updatedAt: now,
        createdAt: now,
      });
    });

    const leaderboard = await t.query(api.ranked.getLeaderboard, { limit: 10 });

    expect(leaderboard.length).toBe(2);
    // Bob should be first (higher rating)
    expect(leaderboard[0].username).toBe("Bob");
    expect(leaderboard[0].rating).toBe(1500);
    expect(leaderboard[1].username).toBe("Alice");
    expect(leaderboard[1].rating).toBe(1200);
  });

  test("leaderboard returns empty when no ratings exist", async () => {
    const t = setupTestConvex();

    const leaderboard = await t.query(api.ranked.getLeaderboard, { limit: 10 });

    expect(leaderboard).toHaveLength(0);
  });
});
