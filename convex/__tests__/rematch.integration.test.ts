/// <reference types="vite/client" />
import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import { setupTestConvex, seedUser, ALICE, BOB } from "./setup.test-helpers";

// ═══════════════════════════════════════════════════════════════════════
// rematch.ts integration tests
// Exercises: requestRematch, getRematchStatus, declineRematch
// ═══════════════════════════════════════════════════════════════════════

/**
 * Helper: seeds cards, creates Alice and Bob, inserts an ended pvpLobby
 * directly, and returns auth contexts + IDs for both players.
 */
async function createEndedPvpMatch(t: ReturnType<typeof setupTestConvex>) {
  await t.mutation(api.seed.seedAll, {});

  const asAlice = await seedUser(t, ALICE, api);
  const asBob = await seedUser(t, BOB, api);

  const aliceUser = await t.run(async (ctx: any) => {
    return ctx.db
      .query("users")
      .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
      .first();
  });
  const bobUser = await t.run(async (ctx: any) => {
    return ctx.db
      .query("users")
      .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:bob-002"))
      .first();
  });

  const matchId = "pvp-match-ended-001";

  await t.run(async (ctx: any) => {
    await ctx.db.insert("pvpLobbies", {
      matchId,
      mode: "pvp",
      hostUserId: String(aliceUser!._id),
      hostUsername: "Alice",
      visibility: "public",
      status: "ended",
      createdAt: Date.now() - 60_000,
      endedAt: Date.now() - 1_000,
      pongEnabled: true,
      redemptionEnabled: true,
    });
  });

  return {
    asAlice,
    asBob,
    matchId,
    aliceUserId: String(aliceUser!._id),
    bobUserId: String(bobUser!._id),
  };
}

// ── requestRematch ───────────────────────────────────────────────────

describe("requestRematch", () => {
  test("creates rematch lobby from ended PvP match", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    const result = await asAlice.mutation((api as any).rematch.requestRematch, {
      matchId,
    });

    expect(result.rematchId).toBeTruthy();
    expect(result.rematchId).toMatch(
      new RegExp(`^rematch_${matchId}_\\d+$`),
    );

    // Verify the new lobby exists in DB with status="waiting"
    const lobby = await t.run(async (ctx: any) => {
      return ctx.db
        .query("pvpLobbies")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", result.rematchId))
        .first();
    });

    expect(lobby).toBeTruthy();
    expect(lobby!.status).toBe("waiting");
    expect(lobby!.mode).toBe("pvp");
  });

  test("preserves original lobby settings (pong, redemption)", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    const { rematchId } = await asAlice.mutation(
      (api as any).rematch.requestRematch,
      { matchId },
    );

    const rematchLobby = await t.run(async (ctx: any) => {
      return ctx.db
        .query("pvpLobbies")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", rematchId))
        .first();
    });

    expect(rematchLobby!.pongEnabled).toBe(true);
    expect(rematchLobby!.redemptionEnabled).toBe(true);
  });

  test("rejects rematch for non-ended match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);

    const aliceUser = await t.run(async (ctx: any) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
        .first();
    });

    // Insert a lobby that is still "waiting" (not ended)
    await t.run(async (ctx: any) => {
      await ctx.db.insert("pvpLobbies", {
        matchId: "pvp-active-001",
        mode: "pvp",
        hostUserId: String(aliceUser!._id),
        hostUsername: "Alice",
        visibility: "public",
        status: "waiting",
        createdAt: Date.now(),
        pongEnabled: false,
        redemptionEnabled: false,
      });
    });

    await expect(
      asAlice.mutation((api as any).rematch.requestRematch, {
        matchId: "pvp-active-001",
      }),
    ).rejects.toThrow("Match must be ended to request rematch.");
  });

  test("rejects rematch for non-existent match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);

    await expect(
      asAlice.mutation((api as any).rematch.requestRematch, {
        matchId: "does-not-exist-99999",
      }),
    ).rejects.toThrow("Match must be ended to request rematch.");
  });

  test("deduplicates rematch requests", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    const first = await asAlice.mutation(
      (api as any).rematch.requestRematch,
      { matchId },
    );
    const second = await asAlice.mutation(
      (api as any).rematch.requestRematch,
      { matchId },
    );

    // Both calls return the same rematchId
    expect(first.rematchId).toBe(second.rematchId);

    // Only one waiting rematch lobby should exist
    const allLobbies = await t.run(async (ctx: any) => {
      return ctx.db
        .query("pvpLobbies")
        .withIndex("by_status", (q: any) => q.eq("status", "waiting"))
        .collect();
    });
    const rematchLobbies = allLobbies.filter(
      (l: any) =>
        typeof l.matchId === "string" &&
        l.matchId.startsWith(`rematch_${matchId}_`),
    );
    expect(rematchLobbies).toHaveLength(1);
  });

  test("requires authentication", async () => {
    const t = setupTestConvex();
    const { matchId } = await createEndedPvpMatch(t);

    // Call without withIdentity — unauthenticated
    await expect(
      t.mutation((api as any).rematch.requestRematch, { matchId }),
    ).rejects.toThrow();
  });

  test("rematch matchId follows naming convention", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    const { rematchId } = await asAlice.mutation(
      (api as any).rematch.requestRematch,
      { matchId },
    );

    // Must follow pattern: rematch_{originalMatchId}_{timestamp}
    expect(rematchId).toMatch(/^rematch_.+_\d+$/);
    expect(rematchId.startsWith(`rematch_${matchId}_`)).toBe(true);

    const parts = rematchId.split("_");
    const timestamp = Number(parts[parts.length - 1]);
    expect(Number.isFinite(timestamp)).toBe(true);
    expect(timestamp).toBeGreaterThan(0);
  });
});

// ── getRematchStatus ─────────────────────────────────────────────────

describe("getRematchStatus", () => {
  test("returns hasRematch=true after request", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId, aliceUserId } = await createEndedPvpMatch(t);

    const { rematchId } = await asAlice.mutation(
      (api as any).rematch.requestRematch,
      { matchId },
    );

    const status = await t.query((api as any).rematch.getRematchStatus, {
      matchId,
    });

    expect(status.hasRematch).toBe(true);
    expect(status.rematchMatchId).toBe(rematchId);
    expect(status.requestedBy).toBe(aliceUserId);
  });

  test("returns hasRematch=false when no request", async () => {
    const t = setupTestConvex();
    const { matchId } = await createEndedPvpMatch(t);

    // No rematch requested yet
    const status = await t.query((api as any).rematch.getRematchStatus, {
      matchId,
    });

    expect(status.hasRematch).toBe(false);
  });

  test("returns hasRematch=false after decline", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    await asAlice.mutation((api as any).rematch.requestRematch, { matchId });
    await asAlice.mutation((api as any).rematch.declineRematch, { matchId });

    const status = await t.query((api as any).rematch.getRematchStatus, {
      matchId,
    });

    expect(status.hasRematch).toBe(false);
  });

  test("returns hasRematch=false for non-existent match", async () => {
    const t = setupTestConvex();

    const status = await t.query((api as any).rematch.getRematchStatus, {
      matchId: "random-nonexistent-match-xyz",
    });

    expect(status.hasRematch).toBe(false);
  });

  test("tracks requestedBy correctly", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId, aliceUserId } = await createEndedPvpMatch(t);

    await asAlice.mutation((api as any).rematch.requestRematch, { matchId });

    const status = await t.query((api as any).rematch.getRematchStatus, {
      matchId,
    });

    expect(status.hasRematch).toBe(true);
    expect(status.requestedBy).toBe(aliceUserId);
  });
});

// ── declineRematch ───────────────────────────────────────────────────

describe("declineRematch", () => {
  test("cancels waiting rematch lobby", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    const { rematchId } = await asAlice.mutation(
      (api as any).rematch.requestRematch,
      { matchId },
    );

    await asAlice.mutation((api as any).rematch.declineRematch, { matchId });

    // Verify lobby is now "canceled" and has endedAt set
    const lobby = await t.run(async (ctx: any) => {
      return ctx.db
        .query("pvpLobbies")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", rematchId))
        .first();
    });

    expect(lobby!.status).toBe("canceled");
    expect(lobby!.endedAt).toBeTruthy();
    expect(typeof lobby!.endedAt).toBe("number");
  });

  test("returns declined=true when lobby exists", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    await asAlice.mutation((api as any).rematch.requestRematch, { matchId });

    const result = await asAlice.mutation(
      (api as any).rematch.declineRematch,
      { matchId },
    );

    expect(result.declined).toBe(true);
  });

  test("returns declined=false when no rematch", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    // No rematch was ever requested — decline should return false
    const result = await asAlice.mutation(
      (api as any).rematch.declineRematch,
      { matchId },
    );

    expect(result.declined).toBe(false);
  });

  test("requires authentication", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    await asAlice.mutation((api as any).rematch.requestRematch, { matchId });

    // Call without withIdentity — unauthenticated
    await expect(
      t.mutation((api as any).rematch.declineRematch, { matchId }),
    ).rejects.toThrow();
  });

  test("idempotent on already-declined rematch", async () => {
    const t = setupTestConvex();
    const { asAlice, matchId } = await createEndedPvpMatch(t);

    await asAlice.mutation((api as any).rematch.requestRematch, { matchId });

    // First decline cancels the lobby
    const first = await asAlice.mutation(
      (api as any).rematch.declineRematch,
      { matchId },
    );
    expect(first.declined).toBe(true);

    // Second decline finds no waiting lobby (already canceled) → returns false
    const second = await asAlice.mutation(
      (api as any).rematch.declineRematch,
      { matchId },
    );
    expect(second.declined).toBe(false);
  });

  test("opponent can also decline", async () => {
    const t = setupTestConvex();
    const { asAlice, asBob, matchId } = await createEndedPvpMatch(t);

    // Alice requests rematch
    await asAlice.mutation((api as any).rematch.requestRematch, { matchId });

    // Bob declines — should be permitted (any authenticated user can decline)
    const result = await asBob.mutation(
      (api as any).rematch.declineRematch,
      { matchId },
    );

    expect(result.declined).toBe(true);

    // Confirm lobby is canceled
    const status = await t.query((api as any).rematch.getRematchStatus, {
      matchId,
    });
    expect(status.hasRematch).toBe(false);
  });
});
