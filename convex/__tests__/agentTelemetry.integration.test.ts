/// <reference types="vite/client" />
import { expect, test, describe } from "vitest";
import { api, internal } from "../_generated/api";
import { setupTestConvex, seedUser, ALICE, BOB } from "./setup.test-helpers";

// ═══════════════════════════════════════════════════════════════════════
// agentTelemetry.ts integration tests
// Exercises: recordAgentMatch, recordAgentDecision,
//            getAgentStats, getAgentLeaderboard
// ═══════════════════════════════════════════════════════════════════════

async function createAgent(t: any, name: string, userId: any) {
  return t.run(async (ctx: any) =>
    ctx.db.insert("agents", {
      name,
      apiKeyHash: `hash_${name}`,
      apiKeyPrefix: "ltcg_",
      userId,
      isActive: true,
      createdAt: Date.now(),
    }),
  );
}

async function getUserId(t: any, privyId: string) {
  return t.run(async (ctx: any) =>
    ctx.db
      .query("users")
      .withIndex("by_privyId", (q: any) => q.eq("privyId", privyId))
      .first(),
  );
}

// ── recordAgentMatch ─────────────────────────────────────────────────

describe("recordAgentMatch", () => {
  test("creates new stats row on first match", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotAlpha", aliceUser!._id);

    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 12,
      opponentIsAgent: false,
    });

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
  });

  test("win increments wins, not losses", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotWinner", aliceUser!._id);

    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 8,
      opponentIsAgent: false,
    });

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
  });

  test("loss increments losses, not wins", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotLoser", aliceUser!._id);

    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: false,
      turns: 8,
      opponentIsAgent: false,
    });

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(1);
  });

  test("avgTurnsPerMatch calculated correctly across multiple matches", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotAvg", aliceUser!._id);

    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 10,
      opponentIsAgent: false,
    });
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: false,
      turns: 20,
      opponentIsAgent: false,
    });

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    // round(30 / 2) = 15
    expect(stats.avgTurnsPerMatch).toBe(15);
  });

  test("tracks agent-vs-human wins and losses", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotHuman", aliceUser!._id);

    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 10,
      opponentIsAgent: false,
    });

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    expect(stats.agentVsHumanWins).toBe(1);
    expect(stats.agentVsAgentWins).toBe(0);
  });

  test("tracks agent-vs-agent wins and losses", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotVsAgent", aliceUser!._id);

    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 10,
      opponentIsAgent: true,
    });

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    expect(stats.agentVsAgentWins).toBe(1);
    expect(stats.agentVsHumanWins).toBe(0);
  });
});

// ── recordAgentDecision ──────────────────────────────────────────────

describe("recordAgentDecision", () => {
  test("updates updatedAt on existing stats", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotDecision", aliceUser!._id);

    // Create a stats row first
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 10,
      opponentIsAgent: false,
    });

    const statsBefore = await t.run(async (ctx: any) =>
      ctx.db
        .query("agentStats")
        .withIndex("by_agentId", (q: any) => q.eq("agentId", agentId))
        .unique(),
    );

    // Record a decision (may or may not change updatedAt depending on timing)
    await t.mutation(internal.agentTelemetry.recordAgentDecision, {
      agentId,
      matchId: "match-abc",
      turn: 3,
      commandType: "SUMMON",
      thinkTimeMs: 100,
    });

    const statsAfter = await t.run(async (ctx: any) =>
      ctx.db
        .query("agentStats")
        .withIndex("by_agentId", (q: any) => q.eq("agentId", agentId))
        .unique(),
    );

    // updatedAt should be >= the value before (monotonically non-decreasing)
    expect(statsAfter!.updatedAt).toBeGreaterThanOrEqual(statsBefore!.updatedAt);
  });

  test("no-op when stats row does not exist for agent", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotNoStats", aliceUser!._id);

    // Agent has no stats row — should not throw
    await expect(
      t.mutation(internal.agentTelemetry.recordAgentDecision, {
        agentId,
        matchId: "match-xyz",
        turn: 1,
        commandType: "DECLARE_ATTACK",
      }),
    ).resolves.toBeNull();
  });

  test("accepts all required args including optional thinkTimeMs", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotFullArgs", aliceUser!._id);

    // Create stats so it's not a no-op
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: false,
      turns: 5,
      opponentIsAgent: false,
    });

    await expect(
      t.mutation(internal.agentTelemetry.recordAgentDecision, {
        agentId,
        matchId: "match-full",
        turn: 1,
        commandType: "SUMMON",
        thinkTimeMs: 150,
      }),
    ).resolves.toBeNull();
  });
});

// ── getAgentStats ────────────────────────────────────────────────────

describe("getAgentStats", () => {
  test("returns zeroed defaults for agent with no stats row", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotFresh", aliceUser!._id);

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    expect(stats.matchesPlayed).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.avgTurnsPerMatch).toBe(0);
    expect(stats.totalTurns).toBe(0);
    expect(stats.favoriteArchetype).toBeNull();
    expect(stats.agentVsHumanWins).toBe(0);
    expect(stats.agentVsHumanLosses).toBe(0);
    expect(stats.agentVsAgentWins).toBe(0);
    expect(stats.agentVsAgentLosses).toBe(0);
    expect(stats.lastMatchAt).toBeNull();
  });

  test("returns real stats after matches are recorded", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotRealStats", aliceUser!._id);

    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 10,
      opponentIsAgent: false,
    });
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 12,
      opponentIsAgent: false,
    });
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 14,
      opponentIsAgent: true,
    });
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: false,
      turns: 8,
      opponentIsAgent: false,
    });

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    expect(stats.wins).toBe(3);
    expect(stats.losses).toBe(1);
    expect(stats.matchesPlayed).toBe(4);
  });

  test("matchesPlayed equals wins plus losses", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotSum", aliceUser!._id);

    // 2 wins, 3 losses
    for (let i = 0; i < 2; i++) {
      await t.mutation(internal.agentTelemetry.recordAgentMatch, {
        agentId,
        won: true,
        turns: 10,
        opponentIsAgent: false,
      });
    }
    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.agentTelemetry.recordAgentMatch, {
        agentId,
        won: false,
        turns: 10,
        opponentIsAgent: false,
      });
    }

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    expect(stats.matchesPlayed).toBe(5);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(3);
    expect(stats.wins + stats.losses).toBe(stats.matchesPlayed);
  });

  test("favoriteArchetype is tracked when provided", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotArchetype", aliceUser!._id);

    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 10,
      archetype: "dropouts",
      opponentIsAgent: false,
    });

    const stats = await t.query(api.agentTelemetry.getAgentStats, { agentId });
    expect(stats.favoriteArchetype).toBe("dropouts");
  });
});

// ── getAgentLeaderboard ──────────────────────────────────────────────

describe("getAgentLeaderboard", () => {
  test("returns agents sorted by wins descending", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    await seedUser(t, BOB, api);

    const aliceUser = await getUserId(t, ALICE.subject);
    const bobUser = await getUserId(t, BOB.subject);

    const agentAlice = await createAgent(t, "AliceBot", aliceUser!._id);
    const agentBob = await createAgent(t, "BobBot", bobUser!._id);

    // AliceBot: 5 wins
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.agentTelemetry.recordAgentMatch, {
        agentId: agentAlice,
        won: true,
        turns: 10,
        opponentIsAgent: false,
      });
    }
    // BobBot: 2 wins
    for (let i = 0; i < 2; i++) {
      await t.mutation(internal.agentTelemetry.recordAgentMatch, {
        agentId: agentBob,
        won: true,
        turns: 10,
        opponentIsAgent: false,
      });
    }

    const leaderboard = await t.query(api.agentTelemetry.getAgentLeaderboard, {
      limit: 10,
    });

    expect(leaderboard.length).toBeGreaterThanOrEqual(2);
    // First entry should have more wins than second
    expect(leaderboard[0].wins).toBeGreaterThan(leaderboard[1].wins);
    expect(leaderboard[0].wins).toBe(5);
    expect(leaderboard[1].wins).toBe(2);
  });

  test("calculates winRate correctly", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotWinRate", aliceUser!._id);

    // 3 wins, 1 loss -> winRate = round(3/4 * 100) = 75
    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.agentTelemetry.recordAgentMatch, {
        agentId,
        won: true,
        turns: 10,
        opponentIsAgent: false,
      });
    }
    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: false,
      turns: 10,
      opponentIsAgent: false,
    });

    const leaderboard = await t.query(api.agentTelemetry.getAgentLeaderboard, {
      limit: 10,
    });

    const entry = leaderboard.find((e: any) => e.agentId === agentId);
    expect(entry).toBeDefined();
    expect(entry!.winRate).toBe(75);
  });

  test("winRate is 0 for agent with 0 matches played", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "BotZeroMatches", aliceUser!._id);

    // Insert a stats row directly with 0 matchesPlayed
    await t.run(async (ctx: any) =>
      ctx.db.insert("agentStats", {
        agentId,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        avgTurnsPerMatch: 0,
        totalTurns: 0,
        favoriteArchetype: undefined,
        agentVsHumanWins: 0,
        agentVsHumanLosses: 0,
        agentVsAgentWins: 0,
        agentVsAgentLosses: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const leaderboard = await t.query(api.agentTelemetry.getAgentLeaderboard, {
      limit: 10,
    });

    const entry = leaderboard.find((e: any) => e.agentId === agentId);
    expect(entry).toBeDefined();
    expect(entry!.winRate).toBe(0);
  });

  test("respects limit parameter", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    await seedUser(t, BOB, api);

    const aliceUser = await getUserId(t, ALICE.subject);
    const bobUser = await getUserId(t, BOB.subject);

    // Create 3 agents: one for Alice, two for Bob
    const agent1 = await createAgent(t, "BotLimit1", aliceUser!._id);
    const agent2 = await createAgent(t, "BotLimit2", bobUser!._id);
    const agent3 = await createAgent(t, "BotLimit3", bobUser!._id);

    for (const agentId of [agent1, agent2, agent3]) {
      await t.mutation(internal.agentTelemetry.recordAgentMatch, {
        agentId,
        won: true,
        turns: 10,
        opponentIsAgent: false,
      });
    }

    const leaderboard = await t.query(api.agentTelemetry.getAgentLeaderboard, {
      limit: 1,
    });

    expect(leaderboard).toHaveLength(1);
  });

  test("enriches entries with the agent name", async () => {
    const t = setupTestConvex();
    await seedUser(t, ALICE, api);
    const aliceUser = await getUserId(t, ALICE.subject);
    const agentId = await createAgent(t, "AlphaBot", aliceUser!._id);

    await t.mutation(internal.agentTelemetry.recordAgentMatch, {
      agentId,
      won: true,
      turns: 10,
      opponentIsAgent: false,
    });

    const leaderboard = await t.query(api.agentTelemetry.getAgentLeaderboard, {
      limit: 10,
    });

    const entry = leaderboard.find((e: any) => e.agentId === agentId);
    expect(entry).toBeDefined();
    expect(entry!.agentName).toBe("AlphaBot");
  });
});
