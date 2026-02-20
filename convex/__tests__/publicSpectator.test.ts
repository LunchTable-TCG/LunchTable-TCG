import { describe, it, expect } from "vitest";
import {
  buildPublicSpectatorView,
  buildPublicEventLog,
  type PublicSpectatorSlot,
} from "../publicSpectator";

// ── Helpers ─────────────────────────────────────────────────────────

const CARD_LOOKUP = {
  warrior_01: { name: "Crypto Carl", attack: 2000, defense: 1000, cardType: "stereotype" },
  spell_01: { name: "Pump It", cardType: "spell" },
  trap_01: { name: "Rug Pull", cardType: "trap" },
  hidden_monster: { name: "Secret Agent", attack: 1500, defense: 800, cardType: "stereotype" },
};

function createMinimalView(overrides: Record<string, unknown> = {}) {
  return {
    currentTurnPlayer: "host",
    currentPhase: "main",
    turnNumber: 3,
    gameOver: false,
    winner: null,
    maxBoardSlots: 3,
    maxSpellTrapSlots: 3,
    hand: ["card_a", "card_b"],
    opponentHandCount: 4,
    board: [],
    opponentBoard: [],
    spellTrapZone: [],
    opponentSpellTrapZone: [],
    lifePoints: 8000,
    opponentLifePoints: 6000,
    deckCount: 25,
    opponentDeckCount: 23,
    graveyard: ["g1", "g2"],
    opponentGraveyard: ["og1"],
    banished: [],
    opponentBanished: ["ob1"],
    ...overrides,
  };
}

// ── buildPublicSpectatorView ────────────────────────────────────────

describe("buildPublicSpectatorView", () => {
  it("returns correct basic structure", () => {
    const result = buildPublicSpectatorView({
      matchId: "match_123",
      seat: "host",
      view: createMinimalView(),
      cardLookup: CARD_LOOKUP,
    });

    expect(result.matchId).toBe("match_123");
    expect(result.seat).toBe("host");
    expect(result.phase).toBe("main");
    expect(result.turnNumber).toBe(3);
    expect(result.gameOver).toBe(false);
    expect(result.winner).toBe(null);
  });

  it("sets isAgentTurn when current turn matches seat", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({ currentTurnPlayer: "host" }),
      cardLookup: {},
    });
    expect(result.isAgentTurn).toBe(true);
  });

  it("sets isAgentTurn false when current turn is opponent", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({ currentTurnPlayer: "away" }),
      cardLookup: {},
    });
    expect(result.isAgentTurn).toBe(false);
  });

  it("populates player stats correctly", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView(),
      cardLookup: {},
    });

    expect(result.players.agent.lifePoints).toBe(8000);
    expect(result.players.agent.deckCount).toBe(25);
    expect(result.players.agent.handCount).toBe(2);
    expect(result.players.agent.graveyardCount).toBe(2);
    expect(result.players.agent.banishedCount).toBe(0);

    expect(result.players.opponent.lifePoints).toBe(6000);
    expect(result.players.opponent.deckCount).toBe(23);
    expect(result.players.opponent.handCount).toBe(4);
    expect(result.players.opponent.graveyardCount).toBe(1);
    expect(result.players.opponent.banishedCount).toBe(1);
  });

  // ── INFORMATION LEAKAGE TESTS ────────────────────────────────────

  it("does NOT expose hand card IDs in spectator view", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({ hand: ["secret_card_1", "secret_card_2"] }),
      cardLookup: {},
    });

    // The public view only shows handCount, never the IDs
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret_card_1");
    expect(serialized).not.toContain("secret_card_2");
    expect(result.players.agent.handCount).toBe(2);
  });

  it("hides face-down monster names and stats", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({
        board: [
          { definitionId: "hidden_monster", faceDown: true, position: "defense" },
        ],
      }),
      cardLookup: CARD_LOOKUP,
    });

    const slot = result.fields.agent.monsters[0];
    expect(slot.occupied).toBe(true);
    expect(slot.faceDown).toBe(true);
    expect(slot.name).toBe(null); // Must not reveal name
    expect(slot.attack).toBe(null); // Must not reveal stats
    expect(slot.defense).toBe(null);
  });

  it("shows face-up monster names and stats", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({
        board: [
          { definitionId: "warrior_01", faceDown: false, position: "attack" },
        ],
      }),
      cardLookup: CARD_LOOKUP,
    });

    const slot = result.fields.agent.monsters[0];
    expect(slot.occupied).toBe(true);
    expect(slot.faceDown).toBe(false);
    expect(slot.name).toBe("Crypto Carl");
    expect(slot.attack).toBe(2000);
    expect(slot.defense).toBe(1000);
    expect(slot.kind).toBe("monster");
  });

  it("hides face-down spell/trap names", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({
        spellTrapZone: [
          { definitionId: "trap_01", faceDown: true },
        ],
      }),
      cardLookup: CARD_LOOKUP,
    });

    const slot = result.fields.agent.spellTraps[0];
    expect(slot.occupied).toBe(true);
    expect(slot.faceDown).toBe(true);
    expect(slot.name).toBe(null);
  });

  it("shows face-up spell/trap names and kind", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({
        spellTrapZone: [
          { definitionId: "trap_01", faceDown: false },
        ],
      }),
      cardLookup: CARD_LOOKUP,
    });

    const slot = result.fields.agent.spellTraps[0];
    expect(slot.name).toBe("Rug Pull");
    expect(slot.kind).toBe("trap");
  });

  it("handles 'hidden' definitionId by not revealing info", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({
        opponentBoard: [
          { definitionId: "hidden", faceDown: false, position: "attack" },
        ],
      }),
      cardLookup: CARD_LOOKUP,
    });

    const slot = result.fields.opponent.monsters[0];
    expect(slot.occupied).toBe(true);
    expect(slot.name).toBe("Card"); // fallback
    expect(slot.attack).toBe(null);
  });

  it("fills empty slots up to maxBoardSlots", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({ maxBoardSlots: 5 }),
      cardLookup: {},
    });

    expect(result.fields.agent.monsters).toHaveLength(5);
    expect(result.fields.agent.monsters.every((s: PublicSpectatorSlot) => !s.occupied)).toBe(true);
  });

  it("uses default slots when maxBoardSlots missing", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({ maxBoardSlots: undefined }),
      cardLookup: {},
    });

    expect(result.fields.agent.monsters.length).toBeGreaterThanOrEqual(1);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it("handles missing/invalid types gracefully", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: {
        currentTurnPlayer: "invalid",
        currentPhase: null,
        turnNumber: "not a number",
        gameOver: "yes",
        winner: 42,
        hand: "not an array",
        opponentHandCount: "ten",
        board: null,
        opponentBoard: undefined,
        lifePoints: NaN,
        opponentLifePoints: Infinity,
        deckCount: undefined,
        opponentDeckCount: null,
      },
      cardLookup: {},
    });

    // Should not throw, should use safe defaults
    expect(result.phase).toBe("draw"); // null → default
    expect(result.turnNumber).toBe(1); // invalid → default clamped to 1
    expect(result.gameOver).toBe(false); // string → default
    expect(result.winner).toBe(null); // 42 → null
    expect(result.isAgentTurn).toBe(false); // invalid seat
    expect(result.players.agent.handCount).toBe(0); // string → empty array
    expect(result.players.opponent.handCount).toBe(0); // "ten" → 0
    expect(result.players.agent.lifePoints).toBe(0); // NaN → fallback
  });

  it("passes through optional metadata", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "away",
      status: "in_progress",
      mode: "story",
      view: createMinimalView(),
      cardLookup: {},
      chapterId: "ch_001",
      stageNumber: 3,
    });

    expect(result.status).toBe("in_progress");
    expect(result.mode).toBe("story");
    expect(result.chapterId).toBe("ch_001");
    expect(result.stageNumber).toBe(3);
  });

  it("defaults optional metadata to null", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView(),
      cardLookup: {},
    });

    expect(result.status).toBe(null);
    expect(result.mode).toBe(null);
    expect(result.chapterId).toBe(null);
    expect(result.stageNumber).toBe(null);
  });

  it("correctly maps spell kind in spell/trap zone", () => {
    const result = buildPublicSpectatorView({
      matchId: "m1",
      seat: "host",
      view: createMinimalView({
        spellTrapZone: [
          { definitionId: "spell_01", faceDown: false },
        ],
      }),
      cardLookup: CARD_LOOKUP,
    });

    const slot = result.fields.agent.spellTraps[0];
    expect(slot.kind).toBe("spell");
    expect(slot.name).toBe("Pump It");
  });
});

// ── buildPublicEventLog ─────────────────────────────────────────────

describe("buildPublicEventLog", () => {
  it("returns empty array for empty batches", () => {
    const result = buildPublicEventLog({ batches: [], agentSeat: "host" });
    expect(result).toEqual([]);
  });

  it("attributes agent actions to 'agent'", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 1,
          createdAt: 1000,
          seat: "host",
          events: JSON.stringify([{ type: "ATTACK_DECLARED" }]),
        },
      ],
      agentSeat: "host",
    });

    expect(result).toHaveLength(1);
    expect(result[0].actor).toBe("agent");
    expect(result[0].eventType).toBe("ATTACK_DECLARED");
    expect(result[0].summary).toContain("Agent");
  });

  it("attributes opponent actions to 'opponent'", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 2,
          createdAt: 2000,
          seat: "away",
          events: JSON.stringify([{ type: "CARD_DRAWN" }]),
        },
      ],
      agentSeat: "host",
    });

    expect(result).toHaveLength(1);
    expect(result[0].actor).toBe("opponent");
  });

  it("attributes null seat to 'system'", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 1,
          createdAt: 1000,
          seat: null,
          events: JSON.stringify([{ type: "GAME_ENDED" }]),
        },
      ],
      agentSeat: "host",
    });

    expect(result[0].actor).toBe("system");
  });

  it("handles multiple events in a single batch", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 5,
          createdAt: 5000,
          seat: "host",
          events: JSON.stringify([
            { type: "MONSTER_SUMMONED" },
            { type: "SPELL_ACTIVATED" },
            { type: "DAMAGE_DEALT" },
          ]),
        },
      ],
      agentSeat: "host",
    });

    expect(result).toHaveLength(3);
    expect(result[0].eventType).toBe("MONSTER_SUMMONED");
    expect(result[1].eventType).toBe("SPELL_ACTIVATED");
    expect(result[2].eventType).toBe("DAMAGE_DEALT");
  });

  it("creates fallback entry for batch with no events", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 1,
          createdAt: 1000,
          seat: "host",
          events: JSON.stringify([]),
        },
      ],
      agentSeat: "host",
    });

    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe("ACTION_RESOLVED");
  });

  it("handles non-string events (malformed) gracefully", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 1,
          createdAt: 1000,
          seat: "host",
          events: 42, // not a string
        },
      ],
      agentSeat: "host",
    });

    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe("ACTION_RESOLVED");
  });

  it("handles invalid JSON in events gracefully", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 1,
          createdAt: 1000,
          seat: "host",
          events: "{not valid json",
        },
      ],
      agentSeat: "host",
    });

    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe("ACTION_RESOLVED");
  });

  it("normalizes unknown event types to UNKNOWN", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 1,
          createdAt: 1000,
          seat: "host",
          events: JSON.stringify([{ type: null }]),
        },
      ],
      agentSeat: "host",
    });

    expect(result[0].eventType).toBe("UNKNOWN");
  });

  it("preserves version and createdAt", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 42,
          createdAt: 1706000000,
          seat: "host",
          events: JSON.stringify([{ type: "TURN_STARTED" }]),
        },
      ],
      agentSeat: "host",
    });

    expect(result[0].version).toBe(42);
    expect(result[0].createdAt).toBe(1706000000);
  });

  it("sets createdAt to null for non-finite values", () => {
    const result = buildPublicEventLog({
      batches: [
        {
          version: 1,
          createdAt: "not a number",
          seat: "host",
          events: JSON.stringify([{ type: "TURN_STARTED" }]),
        },
      ],
      agentSeat: "host",
    });

    expect(result[0].createdAt).toBe(null);
  });

  it("provides rationale for known event types", () => {
    const knownTypes = [
      "MONSTER_SUMMONED", "MONSTER_SET", "SPELL_TRAP_SET",
      "SPELL_ACTIVATED", "TRAP_ACTIVATED", "EFFECT_ACTIVATED",
      "ATTACK_DECLARED", "DAMAGE_DEALT", "TURN_ENDED", "GAME_ENDED",
    ];

    for (const type of knownTypes) {
      const result = buildPublicEventLog({
        batches: [{
          version: 1,
          createdAt: 1000,
          seat: "host",
          events: JSON.stringify([{ type }]),
        }],
        agentSeat: "host",
      });

      expect(result[0].rationale.length).toBeGreaterThan(0);
      expect(result[0].rationale).not.toBe("Advance the game state safely."); // should have specific rationale
    }
  });

  it("provides summary for all known event types", () => {
    const result = buildPublicEventLog({
      batches: [{
        version: 1,
        createdAt: 1000,
        seat: "host",
        events: JSON.stringify([
          { type: "TURN_STARTED" },
          { type: "PHASE_CHANGED" },
          { type: "CARD_DRAWN" },
          { type: "MONSTER_SUMMONED" },
          { type: "SPELL_ACTIVATED" },
          { type: "CHAIN_STARTED" },
          { type: "CHAIN_RESOLVED" },
        ]),
      }],
      agentSeat: "host",
    });

    expect(result).toHaveLength(7);
    expect(result[0].summary).toContain("Agent");
    expect(result[1].summary).toBe("Phase advanced");
    expect(result[2].summary).toContain("drew a card");
    expect(result[3].summary).toContain("summoned a monster");
    expect(result[5].summary).toBe("Chain started");
    expect(result[6].summary).toBe("Chain resolved");
  });
});
