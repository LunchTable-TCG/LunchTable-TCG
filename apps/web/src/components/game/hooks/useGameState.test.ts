import { describe, expect, it } from "vitest";
import type { PlayerView } from "../../../lib/convexTypes";

import { deriveValidActions } from "./deriveValidActions";

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

  it("handles missing turnSummoned when deriving flip-summon actions", () => {
    const view = {
      hand: ["monster-in-hand"],
      board: [
        {
          cardId: "m1",
          faceDown: true,
          canAttack: false,
          hasAttackedThisTurn: false,
          definitionId: "m1",
          turnSummoned: undefined,
        },
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
      m1: {
        _id: "m1",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "On board monster",
        level: 4,
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

    expect(result.canSummon.size).toBe(1);
    expect(result.canFlipSummon.has("m1")).toBe(true);
  });

  it("returns deterministic action-set structure", () => {
    const view = {
      hand: ["monster-in-hand", "normal-spell", "normal-spell-2"],
      board: [
        {
          cardId: "board-monster",
          faceDown: false,
          canAttack: true,
          hasAttackedThisTurn: false,
        },
      ],
      spellTrapZone: [],
      opponentBoard: [{ cardId: "op-monster", faceDown: false, canAttack: false, hasAttackedThisTurn: false }],
      currentTurnPlayer: "host",
      currentPriorityPlayer: "host",
      turnNumber: 3,
      currentPhase: "combat",
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
      "normal-spell": {
        _id: "normal-spell",
        type: "spell",
        cardType: "spell",
        cardName: "Normal Spell",
      },
      "normal-spell-2": {
        _id: "normal-spell-2",
        type: "spell",
        cardType: "spell",
        cardName: "Second Spell",
      },
      "board-monster": {
        _id: "board-monster",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Board Monster",
        level: 4,
      },
      "op-monster": {
        _id: "op-monster",
        type: "stereotype",
        cardType: "stereotype",
        cardName: "Opponent Monster",
        level: 4,
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

    expect(result.canSummon instanceof Map).toBe(true);
    expect(result.canSetMonster instanceof Set).toBe(true);
    expect(result.canSetSpellTrap instanceof Set).toBe(true);
    expect(result.canActivateSpell instanceof Set).toBe(true);
    expect(result.canAttack instanceof Map).toBe(true);
    expect(Array.from(result.canAttack.keys())).toEqual(["board-monster"]);
    expect(result.canSummon.size).toBe(0);
    expect(result.canSetMonster.size).toBe(0);
    expect(result.canSetSpellTrap.size).toBe(0);
    expect(result.canAttack.get("board-monster")).toEqual(["op-monster"]);
  });
});
