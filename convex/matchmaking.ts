// Ranked matchmaking queue system
import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./auth";

const RATING_WINDOW_BASE = 200; // Start matching within +/-200 rating
const RATING_WINDOW_EXPAND_PER_MIN = 50; // Expand by 50 per minute waiting
const RATING_WINDOW_MAX = 500;
const QUEUE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes max wait

export const joinRankedQueue = mutation({
  args: { deckId: v.string() },
  returns: v.object({ queued: v.boolean(), matchId: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Check if already in queue (compound index avoids .filter)
    const existing = await ctx.db
      .query("rankedQueue")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user._id).eq("status", "waiting"),
      )
      .first();
    if (existing) throw new ConvexError("Already in ranked queue");

    // Get user's rating
    const ratingRow = await ctx.db
      .query("playerRatings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const rating = ratingRow?.rating ?? 1000;

    // Try immediate match
    const now = Date.now();
    const candidates = await ctx.db
      .query("rankedQueue")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .collect();

    // Find best match within rating window
    const validCandidates = candidates
      .filter((c) => {
        const waitTimeMs = now - c.joinedAt;
        const expandedWindow = Math.min(
          RATING_WINDOW_BASE +
            (waitTimeMs / 60000) * RATING_WINDOW_EXPAND_PER_MIN,
          RATING_WINDOW_MAX,
        );
        return Math.abs(c.rating - rating) <= expandedWindow;
      })
      .sort(
        (a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating),
      );

    const matchPartner = validCandidates[0];

    if (matchPartner) {
      // Create a PvP match via internal function
      const matchId = `ranked_${user._id}_${matchPartner.userId}_${now}`;

      // Mark partner as matched
      await ctx.db.patch(matchPartner._id, {
        status: "matched",
        matchId,
        matchedAt: now,
      });

      // Insert our queue entry as matched too
      await ctx.db.insert("rankedQueue", {
        userId: user._id,
        rating,
        deckId: args.deckId,
        status: "matched",
        matchId,
        joinedAt: now,
        matchedAt: now,
      });

      // Create the actual match via internal mutation
      await ctx.runMutation((internal as any).matchmaking.createRankedMatch, {
        hostUserId: user._id as any,
        awayUserId: matchPartner.userId as any,
        hostDeckId: args.deckId,
        awayDeckId: matchPartner.deckId,
        matchId,
      });

      return { queued: false, matchId };
    }

    // No match found — queue up
    await ctx.db.insert("rankedQueue", {
      userId: user._id,
      rating,
      deckId: args.deckId,
      status: "waiting",
      joinedAt: now,
    });

    return { queued: true };
  },
});

export const leaveRankedQueue = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const entry = await ctx.db
      .query("rankedQueue")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user._id).eq("status", "waiting"),
      )
      .first();
    if (entry) {
      await ctx.db.patch(entry._id, { status: "expired" });
    }
    return null;
  },
});

export const getQueueStatus = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const entry = await ctx.db
      .query("rankedQueue")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user._id).eq("status", "waiting"),
      )
      .first();

    if (!entry) return { inQueue: false };

    const waitingCount = await ctx.db
      .query("rankedQueue")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .collect();

    return {
      inQueue: true,
      joinedAt: entry.joinedAt,
      waitTimeMs: Date.now() - entry.joinedAt,
      playersInQueue: waitingCount.length,
    };
  },
});

// Internal: create actual match for ranked pair
export const createRankedMatch = internalMutation({
  args: {
    hostUserId: v.any(),
    awayUserId: v.any(),
    hostDeckId: v.string(),
    awayDeckId: v.string(),
    matchId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Look up host user to get username for the lobby display
    const hostDoc = await ctx.db.get(args.hostUserId);
    const hostUser = hostDoc as { username?: string } | null;
    await ctx.db.insert("pvpLobbies", {
      matchId: args.matchId,
      mode: "pvp",
      hostUserId: String(args.hostUserId),
      hostUsername: hostUser?.username ?? "Unknown",
      visibility: "private",
      status: "active",
      createdAt: Date.now(),
      activatedAt: Date.now(),
    });
    return null;
  },
});

// Internal: cleanup expired queue entries (call from cron)
export const cleanupExpiredEntries = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const waiting = await ctx.db
      .query("rankedQueue")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .collect();

    for (const entry of waiting) {
      if (now - entry.joinedAt > QUEUE_EXPIRY_MS) {
        await ctx.db.patch(entry._id, { status: "expired" });
      }
    }
    return null;
  },
});
