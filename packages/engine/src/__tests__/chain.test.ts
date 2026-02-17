import { describe, it, expect } from "vitest";
import { createInitialState, decide, evolve } from "../engine.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import type { GameState, SpellTrapCard } from "../types/state.js";

const lookup = {
  "m1": {
    id: "m1",
    name: "M1",
    type: "stereotype" as const,
    level: 4,
    attack: 1500,
    defense: 1000,
    rarity: "common" as const,
    archetype: "dropouts",
    description: "Test monster",
  },
  "trap1": {
    id: "trap1",
    name: "Counter Trap",
    type: "trap" as const,
    trapType: "normal" as const,
    rarity: "common" as const,
    archetype: "dropouts",
    description: "Test trap",
    effects: [{
      id: "trap1_effect",
      type: "trigger" as const,
      description: "Destroy target",
      targetCount: 1,
      actions: [{ type: "destroy" as const, target: "selected" as const }],
    }],
  },
  "trap2": {
    id: "trap2",
    name: "Damage Trap",
    type: "trap" as const,
    trapType: "normal" as const,
    rarity: "common" as const,
    archetype: "preps",
    description: "Test trap",
    effects: [{
      id: "trap2_effect",
      type: "trigger" as const,
      description: "Deal damage",
      actions: [{ type: "damage" as const, amount: 500, target: "opponent" as const }],
    }],
  },
  "trap3": {
    id: "trap3",
    name: "Choice Trap",
    type: "trap" as const,
    trapType: "normal" as const,
    rarity: "common" as const,
    archetype: "dropouts",
    description: "Multi effect trap",
    effects: [
      {
        id: "trap3_effect_a",
        type: "trigger" as const,
        description: "Destroy target",
        targetCount: 1,
        actions: [{ type: "destroy" as const, target: "selected" as const }],
      },
      {
        id: "trap3_effect_b",
        type: "trigger" as const,
        description: "Deal damage",
        actions: [{ type: "damage" as const, amount: 300, target: "opponent" as const }],
      },
    ],
  },
};

function makeState(overrides: Partial<GameState> = {}): GameState {
  const hostDeck = Array(35).fill("m1");
  const awayDeck = Array(35).fill("m1");
  const base = createInitialState(lookup, DEFAULT_CONFIG, "h", "a", hostDeck, awayDeck, "host");
  return { ...base, ...overrides, cardLookup: lookup };
}

function setTrapInZone(state: GameState, seat: "host" | "away", cardId: string, definitionId: string): GameState {
  const trap: SpellTrapCard = { cardId, definitionId, faceDown: true, activated: false };
  if (seat === "host") {
    return { ...state, hostSpellTrapZone: [...state.hostSpellTrapZone, trap] };
  }
  return { ...state, awaySpellTrapZone: [...state.awaySpellTrapZone, trap] };
}

describe("chain system", () => {
  it("CHAIN_RESPONSE with pass emits CHAIN_PASSED", () => {
    const state = makeState({ currentPhase: "main" });
    const events = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "host");
    expect(events.some(e => e.type === "CHAIN_PASSED")).toBe(true);
  });

  it("CHAIN_RESPONSE first pass does not resolve chain", () => {
    const state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target1"],
      }],
    });
    const events = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "away");
    expect(events.some(e => e.type === "CHAIN_RESOLVED")).toBe(false);
  });

  it("CHAIN_RESPONSE resolves chain on opposite-seat second pass", () => {
    const state = makeState({
      currentPhase: "main",
      currentChain: [{
        cardId: "trap1",
        effectIndex: 0,
        activatingPlayer: "host",
        targets: ["target1"],
      }],
      currentChainPasser: "host",
    });
    const events = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "away");
    expect(events.some(e => e.type === "CHAIN_PASSED")).toBe(true);
    expect(events.some(e => e.type === "CHAIN_RESOLVED")).toBe(true);
  });

  it("CHAIN_RESPONSE with cardId adds chain link", () => {
    let state = makeState({ currentPhase: "main" });
    state = setTrapInZone(state, "host", "trap1_instance", "trap1");

    const events = decide(state, { type: "CHAIN_RESPONSE", cardId: "trap1_instance", pass: false }, "host");
    expect(events.some(e => e.type === "CHAIN_LINK_ADDED")).toBe(true);
    expect(events.some(e => e.type === "TRAP_ACTIVATED")).toBe(true);
  });

  it("supports CHAIN_RESPONSE with effectIndex and targets", () => {
    let state = makeState({ currentPhase: "main" });
    state = setTrapInZone(state, "host", "trap3_instance", "trap3");

    const events = decide(state, {
      type: "CHAIN_RESPONSE",
      cardId: "trap3_instance",
      pass: false,
      effectIndex: 1,
      targets: ["targetA", "targetB"],
    }, "host");

    const chainLink = events.find((event) => event.type === "CHAIN_LINK_ADDED");
    expect(chainLink).toBeDefined();
    if (chainLink?.type === "CHAIN_LINK_ADDED") {
      expect(chainLink.effectIndex).toBe(1);
      expect(chainLink.targets).toEqual(["targetA", "targetB"]);
    }
  });

  it("supports legacy CHAIN_RESPONSE sourceCardId alias", () => {
    let state = makeState({ currentPhase: "main" });
    state = setTrapInZone(state, "host", "trap3_instance", "trap3");

    const events = decide(state, {
      type: "CHAIN_RESPONSE",
      pass: false,
      sourceCardId: "trap3_instance",
      effectIndex: 1,
    }, "host");

    const chainLink = events.find((event) => event.type === "CHAIN_LINK_ADDED");
    expect(chainLink).toBeDefined();
    if (chainLink?.type === "CHAIN_LINK_ADDED") {
      expect(chainLink.cardId).toBe("trap3_instance");
    }
  });

  it("supports CHAIN_RESPONSE chainLink alias as effect selection", () => {
    let state = makeState({ currentPhase: "main" });
    state = setTrapInZone(state, "host", "trap3_instance", "trap3");

    const events = decide(state, {
      type: "CHAIN_RESPONSE",
      cardId: "trap3_instance",
      pass: false,
      chainLink: 1,
    }, "host");

    const chainLink = events.find((event) => event.type === "CHAIN_LINK_ADDED");
    expect(chainLink).toBeDefined();
    if (chainLink?.type === "CHAIN_LINK_ADDED") {
      expect(chainLink.effectIndex).toBe(1);
    }
  });

  it("evolve CHAIN_LINK_ADDED adds to currentChain and switches priority", () => {
    let state = makeState();
    state = evolve(state, [{
      type: "CHAIN_LINK_ADDED",
      cardId: "trap1",
      seat: "host",
      effectIndex: 0,
    }]);
    expect(state.currentChain.length).toBe(1);
    expect(state.currentChain[0].cardId).toBe("trap1");
    expect(state.currentPriorityPlayer).toBe("away");
  });

  it("evolve CHAIN_RESOLVED clears chain", () => {
    let state = makeState({
      currentChain: [{ cardId: "trap1", effectIndex: 0, activatingPlayer: "host", targets: [] }],
      currentPriorityPlayer: "away",
    });
    state = evolve(state, [{ type: "CHAIN_RESOLVED" }]);
    expect(state.currentChain).toEqual([]);
    expect(state.currentPriorityPlayer).toBeNull();
  });

  it("evolve CHAIN_STARTED initializes empty chain", () => {
    let state = makeState();
    state = evolve(state, [{ type: "CHAIN_STARTED" }]);
    expect(state.currentChain).toEqual([]);
  });

  it("chain resolves LIFO — last link resolves first", () => {
    const state = makeState({
      currentPhase: "main",
      currentChain: [
        { cardId: "trap1", effectIndex: 0, activatingPlayer: "host", targets: ["target_from_trap1"] },
        { cardId: "trap2", effectIndex: 0, activatingPlayer: "away", targets: [] },
      ],
      currentChainPasser: "away",
    });
    const events = decide(state, { type: "CHAIN_RESPONSE", pass: true }, "host");

    // Should resolve chain
    expect(events.some(e => e.type === "CHAIN_RESOLVED")).toBe(true);

    // trap2 effects should come before trap1 effects (LIFO)
    const chainResolvedIdx = events.findIndex(e => e.type === "CHAIN_RESOLVED");
    const afterResolve = events.slice(chainResolvedIdx + 1);

    // trap2 = damage: 500, trap1 = destroy: target
    // So DAMAGE_DEALT should come before CARD_DESTROYED
    const damageIdx = afterResolve.findIndex(e => e.type === "DAMAGE_DEALT");
    const destroyIdx = afterResolve.findIndex(e => e.type === "CARD_DESTROYED");
    if (damageIdx > -1 && destroyIdx > -1) {
      expect(damageIdx).toBeLessThan(destroyIdx);
    }
  });

  it("CHAIN_RESPONSE with invalid effect index yields no events", () => {
    let state = makeState({ currentPhase: "main" });
    state = setTrapInZone(state, "host", "trap3_instance", "trap3");

    const events = decide(
      {
        type: "CHAIN_RESPONSE",
        cardId: "trap3_instance",
        pass: false,
        effectIndex: 2,
      },
      "host",
    );
    expect(events).toEqual([]);
  });

  it("CHAIN_RESPONSE returns empty events for invalid cardId", () => {
    const state = makeState({ currentPhase: "main" });
    const events = decide(state, { type: "CHAIN_RESPONSE", cardId: "nonexistent", pass: false }, "host");
    expect(events).toEqual([]);
  });

  it("CHAIN_RESPONSE returns empty events when card not in spell/trap zone", () => {
    let state = makeState({ currentPhase: "main" });
    // Add card to hand instead of spell/trap zone
    state = { ...state, hostHand: [...state.hostHand, "trap1"] };

    const events = decide(state, { type: "CHAIN_RESPONSE", cardId: "trap1", pass: false }, "host");
    expect(events).toEqual([]);
  });

  it("evolve CHAIN_PASSED records chain passer and switches priority", () => {
    const state = makeState({
      currentPhase: "main",
      currentChain: [{ cardId: "trap1", effectIndex: 0, activatingPlayer: "host", targets: ["t"] }],
      currentPriorityPlayer: "host",
    });
    const stateAfter = evolve(state, [{ type: "CHAIN_PASSED", seat: "host" }]);

    expect(stateAfter.currentChain).toEqual(state.currentChain);
    expect(stateAfter.currentChainPasser).toBe("host");
    expect(stateAfter.currentPriorityPlayer).toBe("away");
  });
});
