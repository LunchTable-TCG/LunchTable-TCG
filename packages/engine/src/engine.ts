import type { CardDefinition } from "./types/cards.js";
import type { Command } from "./types/commands.js";
import type { EngineEvent } from "./types/events.js";
import type { GameState, PlayerView, Seat, BoardCard, SpellTrapCard } from "./types/state.js";
import type { EngineConfig } from "./types/config.js";
import { DEFAULT_CONFIG } from "./types/config.js";
import { nextPhase, opponentSeat } from "./rules/phases.js";
import { decideSummon, decideSetMonster, decideFlipSummon, evolveSummon } from "./rules/summoning.js";
import { decideSetSpellTrap, decideActivateSpell, decideActivateTrap, evolveSpellTrap } from "./rules/spellsTraps.js";
import { decideDeclareAttack, evolveCombat } from "./rules/combat.js";
import { evolveVice } from "./rules/vice.js";
import { checkStateBasedActions, drawCard } from "./rules/stateBasedActions.js";
import { decideChainResponse } from "./rules/chain.js";
import { resolveEffectActions, canActivateEffect, detectTriggerEffects } from "./rules/effects.js";
import { expectDefined } from "./internal/invariant.js";

export interface EngineOptions {
  config?: Partial<EngineConfig>;
  cardLookup: Record<string, CardDefinition>;
  hostId: string;
  awayId: string;
  hostDeck: string[];
  awayDeck: string[];
  firstPlayer?: Seat;
  seed?: number;
}

export interface Engine {
  getState(): GameState;
  mask(seat: Seat): PlayerView;
  legalMoves(seat: Seat): Command[];
  decide(command: Command, seat: Seat): EngineEvent[];
  evolve(events: EngineEvent[]): void;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEngine(options: EngineOptions): Engine {
  const config: EngineConfig = { ...DEFAULT_CONFIG, ...options.config };
  const rng = options.seed !== undefined ? mulberry32(options.seed) : undefined;
  let state = createInitialState(
    options.cardLookup,
    config,
    options.hostId,
    options.awayId,
    options.hostDeck,
    options.awayDeck,
    options.firstPlayer ?? "host",
    rng
  );

  return {
    getState: () => state,
    mask: (seat: Seat) => mask(state, seat),
    legalMoves: (seat: Seat) => legalMoves(state, seat),
    decide: (command: Command, seat: Seat) => decide(state, command, seat),
    evolve: (events: EngineEvent[]) => {
      state = evolve(state, events);
    },
  };
}

function shuffle<T>(arr: T[], rng?: () => number): T[] {
  const copy = [...arr];
  const random = rng ?? Math.random;
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = expectDefined(copy[i], `engine.shuffle missing value at index ${i}`);
    const target = expectDefined(copy[j], `engine.shuffle missing value at index ${j}`);
    copy[i] = target;
    copy[j] = current;
  }
  return copy;
}

export function createInitialState(
  cardLookup: Record<string, CardDefinition>,
  config: EngineConfig,
  hostId: string,
  awayId: string,
  hostDeckIds: string[],
  awayDeckIds: string[],
  firstPlayer: Seat,
  rng?: () => number
): GameState {
  const hostDeck = shuffle(hostDeckIds, rng);
  const awayDeck = shuffle(awayDeckIds, rng);

  const hostHand = hostDeck.slice(0, config.startingHandSize);
  const hostDeckRemaining = hostDeck.slice(config.startingHandSize);

  const awayHand = awayDeck.slice(0, config.startingHandSize);
  const awayDeckRemaining = awayDeck.slice(config.startingHandSize);

  return {
    config,
    cardLookup,
    hostId,
    awayId,
    hostHand,
    hostBoard: [],
    hostSpellTrapZone: [],
    hostFieldSpell: null,
    hostDeck: hostDeckRemaining,
    hostGraveyard: [],
    hostBanished: [],
    awayHand,
    awayBoard: [],
    awaySpellTrapZone: [],
    awayFieldSpell: null,
    awayDeck: awayDeckRemaining,
    awayGraveyard: [],
    awayBanished: [],
    hostLifePoints: config.startingLP,
    awayLifePoints: config.startingLP,
    hostBreakdownsCaused: 0,
    awayBreakdownsCaused: 0,
    currentTurnPlayer: firstPlayer,
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
    gameStarted: true,
  };
}

function maskBoard(board: BoardCard[]): BoardCard[] {
  return board.map((card) => ({
    ...card,
    definitionId: card.faceDown ? "hidden" : card.definitionId,
  }));
}

function maskSpellTrapZone(zone: SpellTrapCard[]): SpellTrapCard[] {
  return zone.map((card) => ({
    ...card,
    definitionId: card.faceDown ? "hidden" : card.definitionId,
  }));
}

export function mask(state: GameState, seat: Seat): PlayerView {
  const isHost = seat === "host";

  const myHand = isHost ? state.hostHand : state.awayHand;
  const myBoard = isHost ? state.hostBoard : state.awayBoard;
  const mySpellTrapZone = isHost ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const myFieldSpell = isHost ? state.hostFieldSpell : state.awayFieldSpell;
  const myGraveyard = isHost ? state.hostGraveyard : state.awayGraveyard;
  const myBanished = isHost ? state.hostBanished : state.awayBanished;
  const myLifePoints = isHost ? state.hostLifePoints : state.awayLifePoints;
  const myDeckCount = isHost ? state.hostDeck.length : state.awayDeck.length;
  const myBreakdownsCaused = isHost ? state.hostBreakdownsCaused : state.awayBreakdownsCaused;

  const opponentHand = isHost ? state.awayHand : state.hostHand;
  const opponentBoard = isHost ? state.awayBoard : state.hostBoard;
  const opponentSpellTrapZone = isHost ? state.awaySpellTrapZone : state.hostSpellTrapZone;
  const opponentFieldSpell = isHost ? state.awayFieldSpell : state.hostFieldSpell;
  const opponentGraveyard = isHost ? state.awayGraveyard : state.hostGraveyard;
  const opponentBanished = isHost ? state.awayBanished : state.hostBanished;
  const opponentLifePoints = isHost ? state.awayLifePoints : state.hostLifePoints;
  const opponentDeckCount = isHost ? state.awayDeck.length : state.hostDeck.length;
  const opponentBreakdownsCaused = isHost ? state.awayBreakdownsCaused : state.hostBreakdownsCaused;

  return {
    hand: myHand,
    board: myBoard,
    spellTrapZone: mySpellTrapZone,
    fieldSpell: myFieldSpell,
    graveyard: myGraveyard,
    banished: myBanished,
    lifePoints: myLifePoints,
    deckCount: myDeckCount,
    breakdownsCaused: myBreakdownsCaused,
    opponentHandCount: opponentHand.length,
    opponentBoard: maskBoard(opponentBoard),
    opponentSpellTrapZone: maskSpellTrapZone(opponentSpellTrapZone),
    opponentFieldSpell: opponentFieldSpell
      ? {
          ...opponentFieldSpell,
          definitionId: opponentFieldSpell.faceDown ? "hidden" : opponentFieldSpell.definitionId,
        }
      : null,
    opponentGraveyard,
    opponentBanished,
    opponentLifePoints,
    opponentDeckCount,
    opponentBreakdownsCaused,
    currentTurnPlayer: state.currentTurnPlayer,
    currentPriorityPlayer: state.currentPriorityPlayer,
    turnNumber: state.turnNumber,
    currentPhase: state.currentPhase,
    currentChain: state.currentChain,
    mySeat: seat,
    gameOver: state.gameOver,
    winner: state.winner,
    winReason: state.winReason,
  };
}

export function legalMoves(state: GameState, seat: Seat): Command[] {
  if (state.gameOver) return [];

  const isChainWindow = state.currentChain.length > 0;
  const isChainResponder = isChainWindow && state.currentPriorityPlayer === seat;

  if (isChainWindow) {
    if (!isChainResponder) return [];
  } else if (state.currentTurnPlayer !== seat) {
    return [];
  }

  const moves: Command[] = [];

  if (isChainWindow) {
    if (!isChainResponder) return moves;
    moves.push({ type: "CHAIN_RESPONSE", pass: true });

    const responderTrapZone = seat === "host"
      ? state.hostSpellTrapZone
      : state.awaySpellTrapZone;

    for (const setCard of responderTrapZone) {
      if (!setCard.faceDown) continue;

      const setDef = state.cardLookup[setCard.definitionId];
      if (!setDef || setDef.type !== "trap") continue;

      moves.push({
        type: "CHAIN_RESPONSE",
        cardId: setCard.cardId,
        pass: false,
      });
    }

    return moves;
  }

  // Always allow ADVANCE_PHASE and END_TURN and SURRENDER
  moves.push({ type: "ADVANCE_PHASE" });
  moves.push({ type: "END_TURN" });
  moves.push({ type: "SURRENDER" });

  const isHost = seat === "host";
  const hand = isHost ? state.hostHand : state.awayHand;
  const board = isHost ? state.hostBoard : state.awayBoard;
  const spellTrapZone = isHost ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const opponentBoard = isHost ? state.awayBoard : state.hostBoard;
  const normalSummonedThisTurn = isHost ? state.hostNormalSummonedThisTurn : state.awayNormalSummonedThisTurn;

  // Main phase moves (main or main2)
  if (state.currentPhase === "main" || state.currentPhase === "main2") {
    // SUMMON and SET_MONSTER moves
    if (!normalSummonedThisTurn && board.length < state.config.maxBoardSlots) {
      for (const cardId of hand) {
        const card = state.cardLookup[cardId];
        if (!card || card.type !== "stereotype") continue;

        const level = card.level ?? 0;

        // Level 7+ requires 1 tribute
        if (level >= 7) {
          const faceUpMonsters = board.filter((c) => !c.faceDown);
          for (const tributeMonster of faceUpMonsters) {
            // SUMMON with tribute in attack position
            moves.push({
              type: "SUMMON",
              cardId,
              position: "attack",
              tributeCardIds: [tributeMonster.cardId],
            });
            // SUMMON with tribute in defense position
            moves.push({
              type: "SUMMON",
              cardId,
              position: "defense",
              tributeCardIds: [tributeMonster.cardId],
            });
          }
        } else {
          // Level 1-6: no tribute needed
          // SUMMON in attack position
          moves.push({
            type: "SUMMON",
            cardId,
            position: "attack",
          });
          // SUMMON in defense position
          moves.push({
            type: "SUMMON",
            cardId,
            position: "defense",
          });
        }

        // SET_MONSTER (face-down defense)
        moves.push({
          type: "SET_MONSTER",
          cardId,
        });
      }
    }

    // FLIP_SUMMON moves
    for (const boardCard of board) {
      if (boardCard.faceDown && boardCard.turnSummoned < state.turnNumber) {
        moves.push({
          type: "FLIP_SUMMON",
          cardId: boardCard.cardId,
        });
      }
    }

    // SET_SPELL_TRAP moves
    if (spellTrapZone.length < state.config.maxSpellTrapSlots) {
      for (const cardId of hand) {
        const card = state.cardLookup[cardId];
        if (!card || (card.type !== "spell" && card.type !== "trap")) continue;

        moves.push({
          type: "SET_SPELL_TRAP",
          cardId,
        });
      }
    }

    // ACTIVATE_SPELL moves (from hand or face-down set spells)
    for (const cardId of hand) {
      const card = state.cardLookup[cardId];
      if (!card || card.type !== "spell") continue;

      // Check if we have room in spell/trap zone (unless it's a field spell)
      if (card.spellType !== "field" && spellTrapZone.length >= state.config.maxSpellTrapSlots) {
        continue;
      }

      moves.push({
        type: "ACTIVATE_SPELL",
        cardId,
      });
    }

    // ACTIVATE_SPELL for face-down set spells
    for (const setCard of spellTrapZone) {
      if (!setCard.faceDown) continue;

      const card = state.cardLookup[setCard.definitionId];
      if (!card || card.type !== "spell") continue;

      moves.push({
        type: "ACTIVATE_SPELL",
        cardId: setCard.cardId,
      });
    }

    // ACTIVATE_TRAP moves (face-down set traps only)
    for (const setCard of spellTrapZone) {
      if (!setCard.faceDown) continue;

      const card = state.cardLookup[setCard.definitionId];
      if (!card || card.type !== "trap") continue;

      moves.push({
        type: "ACTIVATE_TRAP",
        cardId: setCard.cardId,
      });
    }
  }

  // Combat phase moves
  if (state.currentPhase === "combat") {
    // DECLARE_ATTACK moves
    if (state.turnNumber > 1) {
      const faceUpOpponentMonsters = opponentBoard.filter((c) => !c.faceDown);

      for (const boardCard of board) {
        // Must be face-up, can attack, and hasn't attacked this turn
        if (boardCard.faceDown || !boardCard.canAttack || boardCard.hasAttackedThisTurn) {
          continue;
        }

        // Can attack each opponent monster
        for (const opponentMonster of opponentBoard) {
          moves.push({
            type: "DECLARE_ATTACK",
            attackerId: boardCard.cardId,
            targetId: opponentMonster.cardId,
          });
        }

        // Can direct attack if opponent has no face-up monsters
        if (faceUpOpponentMonsters.length === 0) {
          moves.push({
            type: "DECLARE_ATTACK",
            attackerId: boardCard.cardId,
          });
        }
      }
    }
  }

  return moves;
}

export function decide(state: GameState, command: Command, seat: Seat): EngineEvent[] {
  if (state.gameOver) return [];
  const chainInProgress = state.currentChain.length > 0;
  if (chainInProgress) {
    if (command.type !== "CHAIN_RESPONSE" || state.currentPriorityPlayer !== seat) {
      return [];
    }
  } else if (state.currentTurnPlayer !== seat) {
    return [];
  }

  const events: EngineEvent[] = [];

  switch (command.type) {
    case "ADVANCE_PHASE": {
      const from = state.currentPhase;
      if (from === "end") {
        events.push({ type: "TURN_ENDED", seat });
        const expiredKeys = new Set<string>();
        for (const modifier of state.temporaryModifiers.filter((m) => m.expiresAt === "end_of_turn")) {
          const key = `${modifier.cardId}|${modifier.source}`;
          if (expiredKeys.has(key)) continue;
          expiredKeys.add(key);
          events.push({
            type: "MODIFIER_EXPIRED",
            cardId: modifier.cardId,
            source: modifier.source,
          });
        }
        const nextSeat = opponentSeat(seat);
        events.push({ type: "TURN_STARTED", seat: nextSeat, turnNumber: state.turnNumber + 1 });
        break;
      }

      const to = nextPhase(from);
      events.push({ type: "PHASE_CHANGED", from, to });

      // When transitioning from draw phase, current player draws a card
      if (from === "draw" && to === "standby") {
        events.push(...drawCard(state, state.currentTurnPlayer));
      }
      break;
    }

    case "END_TURN": {
      events.push({ type: "TURN_ENDED", seat });
      const expiredKeys = new Set<string>();
      for (const modifier of state.temporaryModifiers.filter((m) => m.expiresAt === "end_of_turn")) {
        const key = `${modifier.cardId}|${modifier.source}`;
        if (expiredKeys.has(key)) continue;
        expiredKeys.add(key);
        events.push({
          type: "MODIFIER_EXPIRED",
          cardId: modifier.cardId,
          source: modifier.source,
        });
      }
      const nextSeat = opponentSeat(seat);
      events.push({ type: "TURN_STARTED", seat: nextSeat, turnNumber: state.turnNumber + 1 });
      break;
    }

    case "SURRENDER": {
      const winner = opponentSeat(seat);
      events.push({ type: "GAME_ENDED", winner, reason: "surrender" });
      break;
    }

    case "SUMMON": {
      events.push(...decideSummon(state, seat, command));
      break;
    }

    case "SET_MONSTER": {
      events.push(...decideSetMonster(state, seat, command));
      break;
    }

    case "FLIP_SUMMON": {
      events.push(...decideFlipSummon(state, seat, command));
      break;
    }

    case "SET_SPELL_TRAP": {
      events.push(...decideSetSpellTrap(state, seat, command));
      break;
    }

    case "ACTIVATE_SPELL": {
      events.push(...decideActivateSpell(state, seat, command));
      break;
    }

    case "ACTIVATE_TRAP": {
      events.push(...decideActivateTrap(state, seat, command));
      break;
    }

    case "DECLARE_ATTACK": {
      events.push(...decideDeclareAttack(state, seat, command));
      break;
    }

    case "CHAIN_RESPONSE": {
      events.push(...decideChainResponse(state, seat, command));
      break;
    }

    case "ACTIVATE_EFFECT": {
      const { cardId, effectIndex, targets = [] } = command;
      // Must be main phase for ignition effects
      if (state.currentPhase !== "main" && state.currentPhase !== "main2") break;

      // Find the card on the player's board
      const playerBoard = seat === "host" ? state.hostBoard : state.awayBoard;
      const boardCard = playerBoard.find((c) => c.cardId === cardId);
      if (!boardCard) break;
      if (boardCard.faceDown) break;

      // Get card definition
      const cardDef = state.cardLookup[boardCard.definitionId];
      if (!cardDef || !cardDef.effects || effectIndex < 0 || effectIndex >= cardDef.effects.length) break;
      const effects = cardDef.effects;
      const effectDef = effects[effectIndex];
      if (!effectDef) break;
      if (effectDef.type !== "ignition") break;

      // Check OPT/HOPT
      if (!canActivateEffect(state, effectDef)) break;

      // Emit EFFECT_ACTIVATED
      events.push({
        type: "EFFECT_ACTIVATED",
        seat,
        cardId,
        effectIndex,
        targets,
      });

      // Resolve the effect's actions
      events.push(...resolveEffectActions(state, seat, effectDef.actions, cardId, targets));
      break;
    }

    case "CHANGE_POSITION": {
      const { cardId } = command;
      // Must be main phase
      if (state.currentPhase !== "main" && state.currentPhase !== "main2") break;
      // Find card on player's board
      const board = seat === "host" ? state.hostBoard : state.awayBoard;
      const card = board.find((c) => c.cardId === cardId);
      if (!card) break;
      // Must be face-up
      if (card.faceDown) break;
      // Can't change position twice in one turn
      if (card.changedPositionThisTurn) break;
      // Can't change position the turn it was summoned
      if (card.turnSummoned >= state.turnNumber) break;
      const from = card.position;
      const to = from === "attack" ? "defense" : "attack";
      events.push({ type: "POSITION_CHANGED", cardId, from, to });
      break;
    }

    // TODO: Handle other commands
    default:
      break;
  }

  return events;
}

export function evolve(state: GameState, events: EngineEvent[]): GameState {
  let newState = { ...state };

  for (const event of events) {
    switch (event.type) {
      case "PHASE_CHANGED":
        newState.currentPhase = event.to;
        break;

      case "TURN_STARTED":
        newState.currentTurnPlayer = event.seat;
        newState.turnNumber = event.turnNumber;
        newState.currentPhase = "draw";
        // Reset per-turn flags
        newState.hostNormalSummonedThisTurn = false;
        newState.awayNormalSummonedThisTurn = false;
        newState.optUsedThisTurn = [];
        // Reset combat flags for the new turn player's monsters
        if (event.seat === "host") {
          newState.hostBoard = newState.hostBoard.map((c) => ({
            ...c,
            canAttack: true,
            hasAttackedThisTurn: false,
            changedPositionThisTurn: false,
          }));
        } else {
          newState.awayBoard = newState.awayBoard.map((c) => ({
            ...c,
            canAttack: true,
            hasAttackedThisTurn: false,
            changedPositionThisTurn: false,
          }));
        }
        break;

      case "TURN_ENDED":
        // Minimal - the TURN_STARTED event handles the actual state change
        break;

      case "GAME_ENDED":
        newState.gameOver = true;
        newState.winner = event.winner;
        newState.winReason = event.reason;
        break;

      case "MONSTER_SUMMONED":
      case "MONSTER_SET":
      case "FLIP_SUMMONED":
        newState = evolveSummon(newState, event);
        break;

      case "SPELL_TRAP_SET":
      case "SPELL_ACTIVATED":
      case "TRAP_ACTIVATED":
        newState = evolveSpellTrap(newState, event);
        break;

      case "CARD_SENT_TO_GRAVEYARD":
        // Both summoning and spellsTraps can handle this event
        newState = evolveSummon(newState, event);
        newState = evolveSpellTrap(newState, event);
        break;

      case "ATTACK_DECLARED":
      case "DAMAGE_DEALT":
      case "CARD_DESTROYED":
      case "BATTLE_RESOLVED":
        newState = evolveCombat(newState, event);
        break;

      case "VICE_COUNTER_ADDED":
      case "VICE_COUNTER_REMOVED":
      case "BREAKDOWN_TRIGGERED":
        newState = evolveVice(newState, event);
        break;

      case "CARD_DRAWN": {
        const { seat, cardId } = event;
        if (seat === "host") {
          newState.hostDeck = newState.hostDeck.slice(1); // Remove top card from deck
          newState.hostHand = [...newState.hostHand, cardId]; // Add to hand
        } else {
          newState.awayDeck = newState.awayDeck.slice(1);
          newState.awayHand = [...newState.awayHand, cardId];
        }
        break;
      }

      case "DECK_OUT": {
        const { seat } = event;
        const winner = opponentSeat(seat);
        newState.gameOver = true;
        newState.winner = winner;
        newState.winReason = "deck_out";
        break;
      }

      case "MODIFIER_APPLIED": {
        const { cardId, field, amount, source, duration } = event;
        for (const boardKey of ["hostBoard", "awayBoard"] as const) {
          const idx = newState[boardKey].findIndex((c) => c.cardId === cardId);
          if (idx > -1) {
            newState[boardKey] = [...newState[boardKey]];
            const existingCard = expectDefined(
              newState[boardKey][idx],
              `engine.evolve MODIFIER_APPLIED missing board card at index ${idx}`
            );
            const card = { ...existingCard };
            card.temporaryBoosts = { ...card.temporaryBoosts };
            card.temporaryBoosts[field] += amount;
            newState[boardKey][idx] = card;
            break;
          }
        }
        if (duration === "turn") {
          newState.temporaryModifiers = [
            ...newState.temporaryModifiers,
            { cardId, field, amount, source, expiresAt: "end_of_turn" },
          ];
        } else if (!duration || duration === "permanent") {
          newState.temporaryModifiers = [
            ...newState.temporaryModifiers,
            { cardId, field, amount, source, expiresAt: "permanent" },
          ];
        }
        break;
      }

      case "MODIFIER_EXPIRED": {
        const { cardId, source } = event;
        const matchedModifiers = newState.temporaryModifiers.filter(
          (modifier) => modifier.cardId === cardId && modifier.source === source
        );
        if (matchedModifiers.length === 0) break;

        for (const boardKey of ["hostBoard", "awayBoard"] as const) {
          const board = [...newState[boardKey]];
          const idx = board.findIndex((c) => c.cardId === cardId);
          if (idx === -1) continue;

          const existingCard = expectDefined(
            board[idx],
            `engine.evolve MODIFIER_EXPIRED missing board card at index ${idx}`
          );
          const updatedCard = { ...existingCard, temporaryBoosts: { ...existingCard.temporaryBoosts } };

          for (const modifier of matchedModifiers) {
            if (modifier.field === "attack") {
              updatedCard.temporaryBoosts.attack -= modifier.amount;
            } else {
              updatedCard.temporaryBoosts.defense -= modifier.amount;
            }
          }

          board[idx] = updatedCard;
          newState[boardKey] = board;
          break;
        }

        newState.temporaryModifiers = newState.temporaryModifiers.filter(
          (modifier) => !(modifier.cardId === cardId && modifier.source === source)
        );
        break;
      }

      case "CARD_BANISHED": {
        const { cardId, from } = event;
        if (from === "board") {
          for (const [boardKey, banishedKey] of [
            ["hostBoard", "hostBanished"] as const,
            ["awayBoard", "awayBanished"] as const,
          ]) {
            const board = [...newState[boardKey]];
            const idx = board.findIndex((c) => c.cardId === cardId);
            if (idx > -1) {
              const banished = expectDefined(
                newState[banishedKey],
                `engine.evolve CARD_BANISHED missing banished zone ${banishedKey}`
              );
              board.splice(idx, 1);
              newState[boardKey] = board;
              newState[banishedKey] = [...banished, cardId];
              break;
            }
          }
          break;
        }

        if (from === "hand") {
          const hostIdx = newState.hostHand.indexOf(cardId);
          if (hostIdx > -1) {
            const hand = [...newState.hostHand];
            hand.splice(hostIdx, 1);
            newState.hostHand = hand;
            newState.hostBanished = [...newState.hostBanished, cardId];
            break;
          }

          const awayIdx = newState.awayHand.indexOf(cardId);
          if (awayIdx > -1) {
            const hand = [...newState.awayHand];
            hand.splice(awayIdx, 1);
            newState.awayHand = hand;
            newState.awayBanished = [...newState.awayBanished, cardId];
          }
          break;
        }

        if (from === "spellTrapZone" || from === "spell_trap_zone") {
          const hostIdx = newState.hostSpellTrapZone.findIndex((c) => c.cardId === cardId);
          if (hostIdx > -1) {
            const spellTrapZone = [...newState.hostSpellTrapZone];
            spellTrapZone.splice(hostIdx, 1);
            newState.hostSpellTrapZone = spellTrapZone;
            newState.hostBanished = [...newState.hostBanished, cardId];
            break;
          }

          const awayIdx = newState.awaySpellTrapZone.findIndex((c) => c.cardId === cardId);
          if (awayIdx > -1) {
            const spellTrapZone = [...newState.awaySpellTrapZone];
            spellTrapZone.splice(awayIdx, 1);
            newState.awaySpellTrapZone = spellTrapZone;
            newState.awayBanished = [...newState.awayBanished, cardId];
          }
          break;
        }

        if (from === "graveyard") {
          const hostIdx = newState.hostGraveyard.indexOf(cardId);
          if (hostIdx > -1) {
            const graveyard = [...newState.hostGraveyard];
            graveyard.splice(hostIdx, 1);
            newState.hostGraveyard = graveyard;
            newState.hostBanished = [...newState.hostBanished, cardId];
            break;
          }

          const awayIdx = newState.awayGraveyard.indexOf(cardId);
          if (awayIdx > -1) {
            const graveyard = [...newState.awayGraveyard];
            graveyard.splice(awayIdx, 1);
            newState.awayGraveyard = graveyard;
            newState.awayBanished = [...newState.awayBanished, cardId];
          }
        }
        break;
      }

      case "CARD_RETURNED_TO_HAND": {
        const { cardId } = event;

        if (event.from === "board") {
          const hostIdx = newState.hostBoard.findIndex((c) => c.cardId === cardId);
          if (hostIdx > -1) {
            const hostBoard = [...newState.hostBoard];
            hostBoard.splice(hostIdx, 1);
            newState.hostBoard = hostBoard;
            const hand = [...newState.hostHand];
            newState.hostHand = [...hand, cardId];
            break;
          }

          const awayIdx = newState.awayBoard.findIndex((c) => c.cardId === cardId);
          if (awayIdx > -1) {
            const awayBoard = [...newState.awayBoard];
            awayBoard.splice(awayIdx, 1);
            newState.awayBoard = awayBoard;
            const hand = [...newState.awayHand];
            newState.awayHand = [...hand, cardId];
          }
          break;
        }

        if (event.from === "spellTrapZone") {
          const hostIdx = newState.hostSpellTrapZone.findIndex((c) => c.cardId === cardId);
          if (hostIdx > -1) {
            const spellTrapZone = [...newState.hostSpellTrapZone];
            spellTrapZone.splice(hostIdx, 1);
            newState.hostSpellTrapZone = spellTrapZone;
            const hand = [...newState.hostHand];
            newState.hostHand = [...hand, cardId];
            break;
          }

          const awayIdx = newState.awaySpellTrapZone.findIndex((c) => c.cardId === cardId);
          if (awayIdx > -1) {
            const spellTrapZone = [...newState.awaySpellTrapZone];
            spellTrapZone.splice(awayIdx, 1);
            newState.awaySpellTrapZone = spellTrapZone;
            const hand = [...newState.awayHand];
            newState.awayHand = [...hand, cardId];
          }
          break;
        }

        if (event.from === "hand") {
          const hostIdx = newState.hostHand.indexOf(cardId);
          if (hostIdx > -1) {
            const hand = [...newState.hostHand];
            hand.splice(hostIdx, 1);
            newState.hostHand = [...hand, cardId];
            break;
          }

          const awayIdx = newState.awayHand.indexOf(cardId);
          if (awayIdx > -1) {
            const hand = [...newState.awayHand];
            hand.splice(awayIdx, 1);
            newState.awayHand = [...hand, cardId];
          }
          break;
        }

        if (event.from === "graveyard") {
          const hostIdx = newState.hostGraveyard.indexOf(cardId);
          if (hostIdx > -1) {
            const graveyard = [...newState.hostGraveyard];
            graveyard.splice(hostIdx, 1);
            newState.hostGraveyard = graveyard;
            const hand = [...newState.hostHand];
            newState.hostHand = [...hand, cardId];
            break;
          }

          const awayIdx = newState.awayGraveyard.indexOf(cardId);
          if (awayIdx > -1) {
            const graveyard = [...newState.awayGraveyard];
            graveyard.splice(awayIdx, 1);
            newState.awayGraveyard = graveyard;
            const hand = [...newState.awayHand];
            newState.awayHand = [...hand, cardId];
          }
        }
        break;
      }

      case "SPECIAL_SUMMONED": {
        const { seat, cardId, position } = event;
        const isHost = seat === "host";
        const board = isHost ? [...newState.hostBoard] : [...newState.awayBoard];
        const gyKey = isHost ? "hostGraveyard" : "awayGraveyard";
        const gy = [...expectDefined(newState[gyKey], `engine.evolve SPECIAL_SUMMONED missing graveyard ${gyKey}`)];
        const gyIdx = gy.indexOf(cardId);
        if (gyIdx > -1) gy.splice(gyIdx, 1);
        newState[gyKey] = gy;

        const newCard: BoardCard = {
          cardId, definitionId: cardId, position, faceDown: false,
          canAttack: false, hasAttackedThisTurn: false, changedPositionThisTurn: false,
          viceCounters: 0, temporaryBoosts: { attack: 0, defense: 0 }, equippedCards: [],
          turnSummoned: newState.turnNumber,
        };
        board.push(newCard);
        if (isHost) newState.hostBoard = board;
        else newState.awayBoard = board;
        break;
      }

      case "CHAIN_STARTED": {
        newState.currentChain = [];
        newState.currentChainPasser = null;
        newState.currentPriorityPlayer = null;
        break;
      }

      case "CHAIN_LINK_ADDED": {
        const { cardId, seat, effectIndex, targets = [] } = event;
        newState.currentChain = [...newState.currentChain, {
          cardId, activatingPlayer: seat, effectIndex, targets,
        }];
        newState.currentPriorityPlayer = opponentSeat(seat);
        newState.currentChainPasser = null;
        break;
      }

      case "CHAIN_RESOLVED": {
        newState.currentChain = [];
        newState.currentChainPasser = null;
        newState.currentPriorityPlayer = null;
        break;
      }

      case "CHAIN_PASSED": {
        if (newState.currentChain.length > 0) {
          newState.currentChainPasser = event.seat;
          newState.currentPriorityPlayer = opponentSeat(event.seat);
        }
        break;
      }

      case "EFFECT_ACTIVATED": {
        const { effectIndex, cardId } = event;
        const cardDef = expectDefined(
          newState.cardLookup[cardId],
          `engine.evolve EFFECT_ACTIVATED missing card definition for ${cardId}`
        );
        const effects = expectDefined(
          cardDef.effects,
          `engine.evolve EFFECT_ACTIVATED card ${cardId} missing effects`
        );
        const eff = expectDefined(
          effects[effectIndex],
          `engine.evolve EFFECT_ACTIVATED missing effect at index ${effectIndex} for card ${cardId}`
        );

        if (eff.oncePerTurn) {
          newState.optUsedThisTurn = [...newState.optUsedThisTurn, eff.id];
        }
        if (eff.hardOncePerTurn) {
          newState.hoptUsedEffects = [...newState.hoptUsedEffects, eff.id];
        }
        break;
      }

      case "POSITION_CHANGED": {
        const { cardId, to } = event;
        for (const boardKey of ["hostBoard", "awayBoard"] as const) {
          const board = [...newState[boardKey]];
          const idx = board.findIndex((c) => c.cardId === cardId);
          if (idx > -1) {
            const existingCard = expectDefined(
              board[idx],
              `engine.evolve POSITION_CHANGED missing board card at index ${idx}`
            );
            board[idx] = {
              ...existingCard,
              position: to,
              changedPositionThisTurn: true,
            };
            newState[boardKey] = board;
            break;
          }
        }
        break;
      }

      case "GAME_STARTED":
        newState.gameStarted = true;
        break;

      // TODO: Handle other events
      default:
        break;
    }
  }

  // Process trigger effects (on_summon, etc.)
  const triggerEvents = detectTriggerEffects(newState, events);
  if (triggerEvents.length > 0) {
    newState = evolve(newState, triggerEvents);
  }

  // State-based check: LP reaching 0 ends the game
  if (!newState.gameOver) {
    const stateBasedEvents = checkStateBasedActions(newState);
    if (stateBasedEvents.length > 0) {
      newState = evolve(newState, stateBasedEvents);
    }
  }

  return newState;
}
