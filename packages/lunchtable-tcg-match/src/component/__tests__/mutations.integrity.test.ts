import { describe, expect, it } from "vitest";
import type { GameState } from "@lunchtable-tcg/engine";
import {
  assertInitialStateIntegrity,
  haveSameCardCounts,
} from "../mutations";

function makeInitialState(overrides: Partial<GameState> = {}): GameState {
  const base = {
    config: {
      startingHandSize: 5,
      startingLifePoints: 8000,
      maxHandSize: 7,
      maxViceCounters: 3,
      breakdownDamage: 2000,
    },
    cardLookup: {
      h1: { id: "h1", name: "Host Hand", type: "stereotype" },
      h2: { id: "h2", name: "Host Deck 1", type: "stereotype" },
      h3: { id: "h3", name: "Host Deck 2", type: "stereotype" },
      a1: { id: "a1", name: "Away Hand", type: "stereotype" },
      a2: { id: "a2", name: "Away Deck 1", type: "stereotype" },
      a3: { id: "a3", name: "Away Deck 2", type: "stereotype" },
    },
    hostId: "host-user",
    awayId: "away-user",
    gameStarted: true,
    currentTurnPlayer: "host",
    turnNumber: 1,
    currentPhase: "draw",
    hostNormalSummonedThisTurn: false,
    awayNormalSummonedThisTurn: false,
    currentChain: [],
    currentPriorityPlayer: null,
    currentChainPasser: null,
    pendingAction: null,
    temporaryModifiers: [],
    lingeringEffects: [],
    optUsedThisTurn: [],
    hoptUsedEffects: [],
    winner: null,
    winReason: null,
    gameOver: false,
    hostLifePoints: 8000,
    awayLifePoints: 8000,
    hostBreakdownsCaused: 0,
    awayBreakdownsCaused: 0,
    hostFieldSpell: null,
    awayFieldSpell: null,
    hostHand: ["h1"],
    hostDeck: ["h2", "h3"],
    awayHand: ["a1"],
    awayDeck: ["a2", "a3"],
    hostBoard: [],
    awayBoard: [],
    hostSpellTrapZone: [],
    awaySpellTrapZone: [],
    hostGraveyard: [],
    awayGraveyard: [],
    hostBanished: [],
    awayBanished: [],
  };

  return {
    ...base,
    ...overrides,
  } as unknown as GameState;
}

describe("haveSameCardCounts", () => {
  it("matches card multisets regardless of ordering", () => {
    expect(haveSameCardCounts(["a", "b", "a"], ["b", "a", "a"])).toBe(true);
  });

  it("detects card count mismatches", () => {
    expect(haveSameCardCounts(["a", "b"], ["a", "a"])).toBe(false);
  });
});

describe("assertInitialStateIntegrity", () => {
  const match = {
    hostId: "host-user",
    awayId: "away-user",
    hostDeck: ["h1", "h2", "h3"],
    awayDeck: ["a1", "a2", "a3"],
  };

  it("accepts a consistent initial state", () => {
    expect(() => assertInitialStateIntegrity(match, makeInitialState())).not.toThrow();
  });

  it("rejects host identity mismatch", () => {
    const state = makeInitialState({ hostId: "different-host" });
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState hostId does not match match.hostId",
    );
  });

  it("rejects non-empty board/discard zones", () => {
    const state = makeInitialState({
      hostBoard: [{ cardId: "occupied" }],
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState must start with empty board and discard zones",
    );
  });

  it("rejects deck/hand multiset mismatches", () => {
    const state = makeInitialState({
      hostDeck: ["h2"],
    });
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState host deck/hand does not match match.hostDeck",
    );
  });

  it("rejects non-empty current chain as invalid initial state", () => {
    const state = makeInitialState({
      currentChain: [{ id: "1" } as any],
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState must start with no active chain",
    );
  });

  it("rejects open field spells or modifiers at match start", () => {
    const state = makeInitialState({
      hostFieldSpell: { cardId: "field", definitionId: "f1" } as any,
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState must start with empty board and discard zones",
    );
  });

  it("rejects missing card definitions", () => {
    const state = makeInitialState({
      cardLookup: {
        h1: { id: "h1", name: "Host Hand", type: "stereotype" },
      },
    } as unknown as Partial<GameState>);
    expect(() => assertInitialStateIntegrity(match, state)).toThrow(
      "initialState.cardLookup missing definition for h2",
    );
  });
});
