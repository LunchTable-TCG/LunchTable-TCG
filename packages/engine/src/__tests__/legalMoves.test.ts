import { describe, it, expect } from "vitest";
import { createInitialState, legalMoves } from "../engine.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import type { GameState, SpellTrapCard, BoardCard } from "../types/state.js";

const lookup: Record<string, any> = {
  "m1": {
    id: "m1", name: "Basic Monster", type: "stereotype" as const,
    level: 4, attack: 1500, defense: 1000, rarity: "common" as const,
    archetype: "dropouts", description: "Test monster",
  },
  "ignition_monster": {
    id: "ignition_monster", name: "Ignition Monster", type: "stereotype" as const,
    level: 4, attack: 1200, defense: 800, rarity: "common" as const,
    archetype: "geeks", description: "Monster with ignition effect",
    effects: [{
      id: "ignition_eff_1",
      type: "ignition" as const,
      description: "Draw 1 card",
      actions: [{ type: "draw" as const, count: 1 }],
    }],
  },
  "trigger_monster": {
    id: "trigger_monster", name: "Trigger Monster", type: "stereotype" as const,
    level: 3, attack: 1000, defense: 1000, rarity: "common" as const,
    archetype: "freaks", description: "Monster with trigger effect only",
    effects: [{
      id: "trigger_eff_1",
      type: "trigger" as const,
      description: "When destroyed, draw 1",
      actions: [{ type: "draw" as const, count: 1 }],
    }],
  },
  "opt_monster": {
    id: "opt_monster", name: "OPT Monster", type: "stereotype" as const,
    level: 4, attack: 1400, defense: 1000, rarity: "common" as const,
    archetype: "preps", description: "Monster with OPT ignition effect",
    effects: [{
      id: "opt_eff_1",
      type: "ignition" as const,
      description: "Boost ATK",
      oncePerTurn: true,
      actions: [{ type: "boost_attack" as const, amount: 500, duration: "turn" as const }],
    }],
  },
  "trap1": {
    id: "trap1", name: "Normal Trap", type: "trap" as const,
    trapType: "normal" as const, rarity: "common" as const,
    archetype: "dropouts", description: "Test trap",
    effects: [{
      id: "trap1_effect",
      type: "trigger" as const,
      description: "Deal damage",
      actions: [{ type: "damage" as const, amount: 500, target: "opponent" as const }],
    }],
  },
  "qp_spell": {
    id: "qp_spell", name: "Quick Spell", type: "spell" as const,
    spellType: "quick-play" as const, rarity: "common" as const,
    archetype: "geeks", description: "Quick-play spell",
    effects: [{
      id: "qp_effect",
      type: "quick" as const,
      description: "Draw 1",
      actions: [{ type: "draw" as const, count: 1 }],
    }],
  },
  "normal_spell": {
    id: "normal_spell", name: "Normal Spell", type: "spell" as const,
    spellType: "normal" as const, rarity: "common" as const,
    archetype: "preps", description: "Normal spell",
    effects: [{
      id: "ns_effect",
      type: "trigger" as const,
      description: "Draw 1",
      actions: [{ type: "draw" as const, count: 1 }],
    }],
  },
};

function makeState(overrides: Partial<GameState> = {}): GameState {
  const hostDeck = Array(35).fill("m1");
  const awayDeck = Array(35).fill("m1");
  const base = createInitialState(lookup, DEFAULT_CONFIG, "h", "a", hostDeck, awayDeck, "host");
  return { ...base, ...overrides, cardLookup: lookup };
}

function makeBoardCard(cardId: string, definitionId: string, opts: Partial<BoardCard> = {}): BoardCard {
  return {
    cardId, definitionId, position: "attack", faceDown: false,
    canAttack: true, hasAttackedThisTurn: false, changedPositionThisTurn: false,
    viceCounters: 0, temporaryBoosts: { attack: 0, defense: 0 },
    equippedCards: [], turnSummoned: 1, ...opts,
  };
}

function makeTrap(cardId: string, definitionId: string): SpellTrapCard {
  return { cardId, definitionId, faceDown: true, activated: false };
}

describe("legalMoves: ACTIVATE_EFFECT", () => {
  it("generates ACTIVATE_EFFECT for face-up monster with ignition effect in main phase", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      hostBoard: [makeBoardCard("ig1", "ignition_monster")],
    });

    const moves = legalMoves(state, "host");
    const activateEffectMoves = moves.filter(
      (m) => m.type === "ACTIVATE_EFFECT"
    );

    expect(activateEffectMoves.length).toBeGreaterThanOrEqual(1);
    expect(
      activateEffectMoves.some(
        (m) => m.type === "ACTIVATE_EFFECT" && m.cardId === "ig1"
      )
    ).toBe(true);
  });

  it("does NOT generate ACTIVATE_EFFECT for trigger-only effects", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      hostBoard: [makeBoardCard("trig1", "trigger_monster")],
    });

    const moves = legalMoves(state, "host");
    const activateEffectMoves = moves.filter(
      (m) => m.type === "ACTIVATE_EFFECT"
    );

    expect(activateEffectMoves).toHaveLength(0);
  });

  it("does NOT generate ACTIVATE_EFFECT for face-down monsters", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      hostBoard: [makeBoardCard("ig1", "ignition_monster", { faceDown: true })],
    });

    const moves = legalMoves(state, "host");
    const activateEffectMoves = moves.filter(
      (m) => m.type === "ACTIVATE_EFFECT"
    );

    expect(activateEffectMoves).toHaveLength(0);
  });

  it("does NOT generate ACTIVATE_EFFECT outside main phases", () => {
    const state = makeState({
      currentPhase: "combat",
      currentTurnPlayer: "host",
      hostBoard: [makeBoardCard("ig1", "ignition_monster")],
    });

    const moves = legalMoves(state, "host");
    const activateEffectMoves = moves.filter(
      (m) => m.type === "ACTIVATE_EFFECT"
    );

    expect(activateEffectMoves).toHaveLength(0);
  });

  it("does NOT generate ACTIVATE_EFFECT for opponent's monsters", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      awayBoard: [makeBoardCard("ig1", "ignition_monster")],
    });

    const moves = legalMoves(state, "host");
    const activateEffectMoves = moves.filter(
      (m) => m.type === "ACTIVATE_EFFECT"
    );

    expect(activateEffectMoves).toHaveLength(0);
  });

  it("respects OPT: no ACTIVATE_EFFECT when already used this turn", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      hostBoard: [makeBoardCard("opt1", "opt_monster")],
      optUsedThisTurn: ["opt_eff_1"],
    });

    const moves = legalMoves(state, "host");
    const activateEffectMoves = moves.filter(
      (m) => m.type === "ACTIVATE_EFFECT"
    );

    expect(activateEffectMoves).toHaveLength(0);
  });

  it("includes effectIndex in ACTIVATE_EFFECT command", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      hostBoard: [makeBoardCard("ig1", "ignition_monster")],
    });

    const moves = legalMoves(state, "host");
    const activateEffectMove = moves.find(
      (m) => m.type === "ACTIVATE_EFFECT" && m.cardId === "ig1"
    );

    expect(activateEffectMove).toBeDefined();
    expect(activateEffectMove!.type).toBe("ACTIVATE_EFFECT");
    if (activateEffectMove!.type === "ACTIVATE_EFFECT") {
      expect(activateEffectMove!.effectIndex).toBe(0);
    }
  });
});

describe("legalMoves: trap activation during opponent's turn", () => {
  it("generates ACTIVATE_TRAP for set traps during opponent's turn", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "away",
      hostSpellTrapZone: [makeTrap("ht1", "trap1")],
    });

    const moves = legalMoves(state, "host");
    const trapMoves = moves.filter((m) => m.type === "ACTIVATE_TRAP");

    expect(trapMoves.length).toBeGreaterThanOrEqual(1);
    expect(
      trapMoves.some(
        (m) => m.type === "ACTIVATE_TRAP" && m.cardId === "ht1"
      )
    ).toBe(true);
  });

  it("generates ACTIVATE_SPELL for set quick-play spells during opponent's turn", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "away",
      hostSpellTrapZone: [{ cardId: "hqp1", definitionId: "qp_spell", faceDown: true, activated: false }],
    });

    const moves = legalMoves(state, "host");
    const spellMoves = moves.filter((m) => m.type === "ACTIVATE_SPELL");

    expect(spellMoves.length).toBeGreaterThanOrEqual(1);
    expect(
      spellMoves.some(
        (m) => m.type === "ACTIVATE_SPELL" && m.cardId === "hqp1"
      )
    ).toBe(true);
  });

  it("does NOT generate ACTIVATE_SPELL for set normal spells during opponent's turn", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "away",
      hostSpellTrapZone: [{ cardId: "hns1", definitionId: "normal_spell", faceDown: true, activated: false }],
    });

    const moves = legalMoves(state, "host");

    // No moves at all should reference that normal spell card
    const movesForCard = moves.filter(
      (m) => {
        if ("cardId" in m) return (m as any).cardId === "hns1";
        return false;
      }
    );
    expect(movesForCard).toHaveLength(0);
  });

  it("does NOT generate non-trap/spell moves during opponent's turn", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "away",
      hostSpellTrapZone: [makeTrap("ht1", "trap1")],
      hostHand: ["m1"],
    });

    const moves = legalMoves(state, "host");

    const summonMoves = moves.filter((m) => m.type === "SUMMON");
    const setMonsterMoves = moves.filter((m) => m.type === "SET_MONSTER");
    const setSpellTrapMoves = moves.filter((m) => m.type === "SET_SPELL_TRAP");
    const advancePhaseMoves = moves.filter((m) => m.type === "ADVANCE_PHASE");
    const endTurnMoves = moves.filter((m) => m.type === "END_TURN");

    expect(summonMoves).toHaveLength(0);
    expect(setMonsterMoves).toHaveLength(0);
    expect(setSpellTrapMoves).toHaveLength(0);
    expect(advancePhaseMoves).toHaveLength(0);
    expect(endTurnMoves).toHaveLength(0);

    // Only ACTIVATE_TRAP should appear
    const trapMoves = moves.filter((m) => m.type === "ACTIVATE_TRAP");
    expect(trapMoves.length).toBeGreaterThanOrEqual(1);
  });

  it("returns only trap/quick-play activations for the non-turn player", () => {
    const state = makeState({
      currentPhase: "main",
      currentTurnPlayer: "host",
      awaySpellTrapZone: [
        makeTrap("at1", "trap1"),
        { cardId: "aqp1", definitionId: "qp_spell", faceDown: true, activated: false },
      ],
    });

    const moves = legalMoves(state, "away");

    // Should only have trap/spell activation moves
    for (const move of moves) {
      expect(["ACTIVATE_TRAP", "ACTIVATE_SPELL"]).toContain(move.type);
    }

    // Should contain both the trap and the quick-play spell
    expect(moves.some((m) => m.type === "ACTIVATE_TRAP" && m.cardId === "at1")).toBe(true);
    expect(moves.some((m) => m.type === "ACTIVATE_SPELL" && m.cardId === "aqp1")).toBe(true);
  });
});

describe("legalMoves: chain window", () => {
  it("chain responder gets ACTIVATE_TRAP for set traps", () => {
    const state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "some_card",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: [],
      }],
      currentPriorityPlayer: "away",
      awaySpellTrapZone: [makeTrap("at1", "trap1")],
    });

    const moves = legalMoves(state, "away");

    // Should include a pass option
    const passMoves = moves.filter(
      (m) => m.type === "CHAIN_RESPONSE" && m.pass === true
    );
    expect(passMoves.length).toBeGreaterThanOrEqual(1);

    // Should include a chain response with the trap card
    const trapChainMoves = moves.filter(
      (m) => m.type === "CHAIN_RESPONSE" && m.pass === false && m.cardId === "at1"
    );
    expect(trapChainMoves.length).toBeGreaterThanOrEqual(1);
  });

  it("non-responder gets no moves during chain window", () => {
    const state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "some_card",
        effectIndex: 0,
        activatingPlayer: "away",
        targets: [],
      }],
      currentPriorityPlayer: "away",
      hostSpellTrapZone: [makeTrap("ht1", "trap1")],
    });

    const moves = legalMoves(state, "host");

    expect(moves).toHaveLength(0);
  });
});
