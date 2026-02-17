import { describe, expect, it } from "vitest";
import type { PlayerView } from "../../../lib/convexTypes";

import { deriveValidActions } from "./useGameState";

describe("deriveValidActions", () => {
  it("suppresses summon/set monster actions when monster board is full", () => {
    const view = {
      hand: ["monster-in-hand", "monster-in-hand-2", "normal-spell"],
      board: [
        { cardId: "m1", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
        { cardId: "m2", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
        { cardId: "m3", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
        { cardId: "m4", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
        { cardId: "m5", turnSummoned: 1, faceDown: false, canAttack: false, hasAttackedThisTurn: false },
      ],
      spellTrapZone: [],
      opponentBoard: [],
      currentTurnPlayer: "host",
      currentPriorityPlayer: "host",
      turnNumber: 3,
      currentPhase: "main",
      currentChain: [],
      mySeat: "host",
      gameOver: false,
      handSize: 0,
    } as unknown as PlayerView;

    const cardLookup = {
      "monster-in-hand": {
        _id: "monster-in-hand",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Mock Monster",
        level: 4,
      },
      "monster-in-hand-2": {
        _id: "monster-in-hand-2",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Second Monster",
        level: 5,
      },
      "normal-spell": {
        _id: "normal-spell",
        type: "spell",
        cardType: "spell",
        cardName: "Normal Spell",
      },
    } as Record<string, any>;

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: false,
      isChainResponder: true,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
  });

  it("suppresses all actions when chain window is active and player is not chain responder", () => {
    const view = {
      hand: ["monster-in-hand"],
      board: [],
      spellTrapZone: [],
      opponentBoard: [],
      currentTurnPlayer: "host",
      currentPriorityPlayer: "away",
      turnNumber: 3,
      currentPhase: "main",
      currentChain: [{ seat: "away", command: { type: "DRAW" } }],
      mySeat: "host",
      gameOver: false,
      handSize: 0,
    } as unknown as PlayerView;

    const cardLookup = {
      "monster-in-hand": {
        _id: "monster-in-hand",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Mock Monster",
        level: 4,
      },
    } as Record<string, any>;

    const result = deriveValidActions({
      view,
      cardLookup,
      isMyTurn: true,
      isChainWindow: true,
      isChainResponder: false,
      gameOver: false,
    });

    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
    expect(result.canAttack.size).toBe(0);
  });
});
