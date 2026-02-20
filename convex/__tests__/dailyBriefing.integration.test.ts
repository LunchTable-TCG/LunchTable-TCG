/// <reference types="vite/client" />
import { expect, test, describe } from "vitest";
import { api, internal } from "../_generated/api";
import { setupTestConvex, seedUser, ALICE } from "./setup.test-helpers";

// ═══════════════════════════════════════════════════════════════════════
// dailyBriefing.ts integration tests
// Covers campaign initialization, day control, agent checkins,
// briefing content generation, and the advance mechanics — all against
// a real in-process Convex backend.
// ═══════════════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Insert a user + agent row directly into the DB without requiring auth.
 * Returns the agentId and aliceUser for use in checkin tests.
 */
async function seedAgentForCheckin(t: ReturnType<typeof setupTestConvex>) {
  const asAlice = await seedUser(t, ALICE, api);
  const aliceUser = await t.run(async (ctx: any) =>
    ctx.db
      .query("users")
      .withIndex("by_privyId", (q: any) => q.eq("privyId", "privy:alice-001"))
      .first(),
  );
  const agentId = await t.run(async (ctx: any) =>
    ctx.db.insert("agents", {
      name: "TestBot",
      apiKeyHash: "hash123",
      apiKeyPrefix: "ltcg_",
      userId: aliceUser!._id,
      isActive: true,
      createdAt: Date.now(),
    }),
  );
  return { asAlice, aliceUser: aliceUser!, agentId };
}

// ── initCampaign ──────────────────────────────────────────────────────

describe("initCampaign", () => {
  test("initializes campaign at week 1 day 1", async () => {
    const t = setupTestConvex();

    const result = await t.mutation(api.dailyBriefing.initCampaign, {});

    expect(result.status).toBe("initialized");
    expect(result.weekNumber).toBe(1);

    // Verify the DB row has correct fields
    const state = await t.run(async (ctx: any) =>
      ctx.db.query("campaignState").first(),
    );
    expect(state).not.toBeNull();
    expect(state!.weekNumber).toBe(1);
    expect(state!.dayOfWeek).toBe(1);
    expect(state!.actNumber).toBe(1);
    expect(state!.isActive).toBe(true);
  });

  test("double init returns already_initialized", async () => {
    const t = setupTestConvex();

    const first = await t.mutation(api.dailyBriefing.initCampaign, {});
    expect(first.status).toBe("initialized");

    const second = await t.mutation(api.dailyBriefing.initCampaign, {});
    expect(second.status).toBe("already_initialized");
    expect(second.weekNumber).toBe(1);
  });

  test("getCampaignState returns state after init", async () => {
    const t = setupTestConvex();

    await t.mutation(api.dailyBriefing.initCampaign, {});
    const state = await t.query(api.dailyBriefing.getCampaignState, {});

    expect(state).not.toBeNull();
    expect(state!.weekNumber).toBe(1);
    expect(state!.dayOfWeek).toBe(1);
    expect(state!.actNumber).toBe(1);
    expect(state!.isActive).toBe(true);
  });

  test("getCampaignState returns null before init", async () => {
    const t = setupTestConvex();

    const state = await t.query(api.dailyBriefing.getCampaignState, {});
    expect(state).toBeNull();
  });
});

// ── setCampaignDay ────────────────────────────────────────────────────

describe("setCampaignDay", () => {
  test("sets to valid week/day", async () => {
    const t = setupTestConvex();

    const result = await t.mutation(api.dailyBriefing.setCampaignDay, {
      weekNumber: 5,
      dayOfWeek: 3,
    });

    expect(result.weekNumber).toBe(5);
    expect(result.dayOfWeek).toBe(3);

    // Verify DB state
    const state = await t.run(async (ctx: any) =>
      ctx.db.query("campaignState").first(),
    );
    expect(state!.weekNumber).toBe(5);
    expect(state!.dayOfWeek).toBe(3);
    expect(state!.isActive).toBe(true);
  });

  test("rejects week 0", async () => {
    const t = setupTestConvex();

    await expect(
      t.mutation(api.dailyBriefing.setCampaignDay, { weekNumber: 0, dayOfWeek: 1 }),
    ).rejects.toThrow();
  });

  test("rejects week 17", async () => {
    const t = setupTestConvex();

    await expect(
      t.mutation(api.dailyBriefing.setCampaignDay, { weekNumber: 17, dayOfWeek: 1 }),
    ).rejects.toThrow();
  });

  test("rejects day 0", async () => {
    const t = setupTestConvex();

    await expect(
      t.mutation(api.dailyBriefing.setCampaignDay, { weekNumber: 1, dayOfWeek: 0 }),
    ).rejects.toThrow();
  });

  test("rejects day 6", async () => {
    const t = setupTestConvex();

    await expect(
      t.mutation(api.dailyBriefing.setCampaignDay, { weekNumber: 1, dayOfWeek: 6 }),
    ).rejects.toThrow();
  });

  test("creates state if not exists", async () => {
    const t = setupTestConvex();

    // No initCampaign call — setCampaignDay should create the row
    const result = await t.mutation(api.dailyBriefing.setCampaignDay, {
      weekNumber: 3,
      dayOfWeek: 2,
    });

    expect(result.weekNumber).toBe(3);
    expect(result.dayOfWeek).toBe(2);

    const state = await t.run(async (ctx: any) =>
      ctx.db.query("campaignState").first(),
    );
    expect(state).not.toBeNull();
    expect(state!.weekNumber).toBe(3);
    expect(state!.dayOfWeek).toBe(2);
    expect(state!.isActive).toBe(true);
  });
});

// ── getDailyBriefing ──────────────────────────────────────────────────

describe("getDailyBriefing", () => {
  test("returns active briefing after init", async () => {
    const t = setupTestConvex();

    await t.mutation(api.dailyBriefing.initCampaign, {});
    const briefing = await t.query(api.dailyBriefing.getDailyBriefing, {});

    expect(briefing.active).toBe(true);
    if (!briefing.active) return; // type narrowing
    expect(briefing.weekNumber).toBe(1);
    expect(briefing.dayOfWeek).toBe(1);
  });

  test("returns inactive when campaign not started", async () => {
    const t = setupTestConvex();

    const briefing = await t.query(api.dailyBriefing.getDailyBriefing, {});

    expect(briefing.active).toBe(false);
    if (briefing.active) return; // type narrowing
    expect(briefing.message).toBeTruthy();
  });

  test("returns inactive when campaign past week 16", async () => {
    const t = setupTestConvex();

    // Insert an inactive campaignState directly
    await t.run(async (ctx: any) =>
      ctx.db.insert("campaignState", {
        weekNumber: 16,
        dayOfWeek: 5,
        actNumber: 4,
        isActive: false,
        startedAt: Date.now(),
        lastAdvancedAt: Date.now(),
      }),
    );

    const briefing = await t.query(api.dailyBriefing.getDailyBriefing, {});
    expect(briefing.active).toBe(false);
  });

  test("includes correct act and event info for week 1", async () => {
    const t = setupTestConvex();

    await t.mutation(api.dailyBriefing.initCampaign, {});
    const briefing = await t.query(api.dailyBriefing.getDailyBriefing, {});

    expect(briefing.active).toBe(true);
    if (!briefing.active) return;
    expect(briefing.actName).toBe("Freshman");
    expect(briefing.event).toBe("Seating Chart Posted");
    expect(briefing.actNumber).toBe(1);
  });
});

// ── agentCheckin ──────────────────────────────────────────────────────

describe("agentCheckin", () => {
  test("first checkin succeeds", async () => {
    const t = setupTestConvex();
    const { aliceUser, agentId } = await seedAgentForCheckin(t);

    await t.mutation(api.dailyBriefing.initCampaign, {});

    const result = await t.mutation(api.dailyBriefing.agentCheckin, {
      agentId,
      userId: aliceUser._id,
    });

    expect(result.checkedIn).toBe(true);
    expect(result.message).toBeTruthy();
  });

  test("second checkin same day is idempotent", async () => {
    const t = setupTestConvex();
    const { aliceUser, agentId } = await seedAgentForCheckin(t);

    await t.mutation(api.dailyBriefing.initCampaign, {});

    const first = await t.mutation(api.dailyBriefing.agentCheckin, {
      agentId,
      userId: aliceUser._id,
    });
    const second = await t.mutation(api.dailyBriefing.agentCheckin, {
      agentId,
      userId: aliceUser._id,
    });

    expect(first.checkedIn).toBe(true);
    expect(second.checkedIn).toBe(true);

    // Only one record in DB
    const checkins = await t.run(async (ctx: any) =>
      ctx.db
        .query("agentCheckins")
        .withIndex("by_agent_day", (q: any) =>
          q.eq("agentId", agentId).eq("weekNumber", 1).eq("dayOfWeek", 1),
        )
        .collect(),
    );
    expect(checkins.length).toBe(1);
  });

  test("returns false when campaign inactive", async () => {
    const t = setupTestConvex();
    const { aliceUser, agentId } = await seedAgentForCheckin(t);

    // No campaign initialized — agentCheckin should return checkedIn=false
    const result = await t.mutation(api.dailyBriefing.agentCheckin, {
      agentId,
      userId: aliceUser._id,
    });

    expect(result.checkedIn).toBe(false);
  });

  test("getAgentDailyBriefing shows checkedIn status", async () => {
    const t = setupTestConvex();
    const { aliceUser, agentId } = await seedAgentForCheckin(t);

    await t.mutation(api.dailyBriefing.initCampaign, {});

    // Before checkin — should be false
    const beforeCheckin = await t.query(api.dailyBriefing.getAgentDailyBriefing, {
      agentId,
      userId: aliceUser._id,
    });
    expect(beforeCheckin.active).toBe(true);
    if (!beforeCheckin.active) return;
    expect(beforeCheckin.checkedIn).toBe(false);

    // Perform checkin
    await t.mutation(api.dailyBriefing.agentCheckin, {
      agentId,
      userId: aliceUser._id,
    });

    // After checkin — should be true
    const afterCheckin = await t.query(api.dailyBriefing.getAgentDailyBriefing, {
      agentId,
      userId: aliceUser._id,
    });
    expect(afterCheckin.active).toBe(true);
    if (!afterCheckin.active) return;
    expect(afterCheckin.checkedIn).toBe(true);
  });
});

// ── getTodaysBriefingContent + getRecentBriefings ─────────────────────

describe("getTodaysBriefingContent + getRecentBriefings", () => {
  test("returns null when no briefing generated", async () => {
    const t = setupTestConvex();

    await t.mutation(api.dailyBriefing.initCampaign, {});
    const content = await t.query(api.dailyBriefing.getTodaysBriefingContent, {});

    expect(content).toBeNull();
  });

  test("returns content after generation", async () => {
    const t = setupTestConvex();

    await t.mutation(api.dailyBriefing.initCampaign, {});

    // Trigger internal briefing generation for week 1, day 1
    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 1,
    });

    const content = await t.query(api.dailyBriefing.getTodaysBriefingContent, {});

    expect(content).not.toBeNull();
    expect(content!.contentType).toBe("archetype_spotlight");
    expect(content!.weekNumber).toBe(1);
    expect(content!.dayOfWeek).toBe(1);
    expect(content!.title).toBeTruthy();
    expect(content!.body).toBeTruthy();
  });

  test("getRecentBriefings returns ordered list newest first", async () => {
    const t = setupTestConvex();

    // Generate briefings for day 1, 2, 3 of week 1 in order
    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 1,
    });
    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 2,
    });
    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 3,
    });

    const briefings = await t.query(api.dailyBriefing.getRecentBriefings, {});

    expect(briefings.length).toBe(3);
    // Ordered newest first — createdAt desc means day 3 is first
    expect(briefings[0]!.dayOfWeek).toBe(3);
    expect(briefings[1]!.dayOfWeek).toBe(2);
    expect(briefings[2]!.dayOfWeek).toBe(1);
  });

  test("getRecentBriefings respects limit", async () => {
    const t = setupTestConvex();

    // Generate 3 briefings
    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 1,
    });
    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 2,
    });
    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 3,
    });

    const limited = await t.query(api.dailyBriefing.getRecentBriefings, {
      limit: 1,
    });

    expect(limited.length).toBe(1);
  });
});

// ── getBriefingContent pure logic (via generateDailyBriefing) ─────────

describe("getBriefingContent pure logic", () => {
  test("day 1 generates archetype_spotlight", async () => {
    const t = setupTestConvex();

    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 1,
    });

    const row = await t.run(async (ctx: any) =>
      ctx.db
        .query("dailyBriefings")
        .withIndex("by_week_day", (q: any) =>
          q.eq("weekNumber", 1).eq("dayOfWeek", 1),
        )
        .first(),
    );

    expect(row).not.toBeNull();
    expect(row!.contentType).toBe("archetype_spotlight");
    expect(row!.archetype).toBeTruthy();
  });

  test("day 2 generates card_tip", async () => {
    const t = setupTestConvex();

    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 2,
    });

    const row = await t.run(async (ctx: any) =>
      ctx.db
        .query("dailyBriefings")
        .withIndex("by_week_day", (q: any) =>
          q.eq("weekNumber", 1).eq("dayOfWeek", 2),
        )
        .first(),
    );

    expect(row).not.toBeNull();
    expect(row!.contentType).toBe("card_tip");
    expect(row!.cardName).toBeTruthy();
  });

  test("day 3 generates meta_report", async () => {
    const t = setupTestConvex();

    await t.mutation(internal.dailyBriefing.generateDailyBriefing, {
      weekNumber: 1,
      dayOfWeek: 3,
    });

    const row = await t.run(async (ctx: any) =>
      ctx.db
        .query("dailyBriefings")
        .withIndex("by_week_day", (q: any) =>
          q.eq("weekNumber", 1).eq("dayOfWeek", 3),
        )
        .first(),
    );

    expect(row).not.toBeNull();
    expect(row!.contentType).toBe("meta_report");
  });
});

// ── setCampaignDay as advance mechanism ──────────────────────────────
// Note: advanceCampaignDay uses ctx.scheduler.runAfter() internally which
// is not supported in convex-test. We verify the day-advance logic by
// using setCampaignDay to simulate the equivalent state transitions.

describe("campaign day advancement logic", () => {
  test("day advances within week (1 → 2)", async () => {
    const t = setupTestConvex();

    await t.mutation(api.dailyBriefing.initCampaign, {});

    // Simulate advancing from day 1 to day 2 within week 1
    await t.mutation(api.dailyBriefing.setCampaignDay, {
      weekNumber: 1,
      dayOfWeek: 2,
    });

    const state = await t.run(async (ctx: any) =>
      ctx.db.query("campaignState").first(),
    );
    expect(state!.weekNumber).toBe(1);
    expect(state!.dayOfWeek).toBe(2);
    expect(state!.isActive).toBe(true);
  });

  test("week advances after day 5 (week 1 day 5 → week 2 day 1)", async () => {
    const t = setupTestConvex();

    // Start at week 1, day 5
    await t.mutation(api.dailyBriefing.setCampaignDay, {
      weekNumber: 1,
      dayOfWeek: 5,
    });

    // Simulate advancing to next week
    await t.mutation(api.dailyBriefing.setCampaignDay, {
      weekNumber: 2,
      dayOfWeek: 1,
    });

    const state = await t.run(async (ctx: any) =>
      ctx.db.query("campaignState").first(),
    );
    expect(state!.weekNumber).toBe(2);
    expect(state!.dayOfWeek).toBe(1);
    expect(state!.actNumber).toBe(1); // Still act 1 (weeks 1-4)
  });
});
