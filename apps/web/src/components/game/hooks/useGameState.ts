import { useMemo } from "react";
import { api, useConvexQuery } from "@/lib/convexHelpers";
import type {
  CardDefinition,
  GameCardInstance,
  GameSpellTrapInstance,
  MatchMeta,
  OpenPrompt,
  ParsedOpenPrompt,
  PlayerView,
} from "@/lib/convexTypes";

export type Seat = "host" | "away";

export type ValidActions = {
  canSummon: Map<string, { positions: ("attack" | "defense")[]; needsTribute: boolean }>;
  canSetMonster: Set<string>;
  canSetSpellTrap: Set<string>;
  canActivateSpell: Set<string>;
  canActivateTrap: Set<string>;
  canAttack: Map<string, string[]>;
  canFlipSummon: Set<string>;
};

export function deriveValidActions(params: {
  view: PlayerView | null;
  cardLookup: Record<string, CardDefinition>;
  isMyTurn: boolean;
  isChainWindow: boolean;
  isChainResponder: boolean;
  gameOver: boolean;
}) {
  const { view, cardLookup, isMyTurn, isChainWindow, isChainResponder, gameOver } = params;

  const va: ValidActions = {
    canSummon: new Map(),
    canSetMonster: new Set(),
    canSetSpellTrap: new Set(),
    canActivateSpell: new Set(),
    canActivateTrap: new Set(),
    canAttack: new Map(),
    canFlipSummon: new Set(),
  };

  if (!view || gameOver) return va;
  if (isChainWindow && !isChainResponder) return va;
  if (!isChainWindow && !isMyTurn) return va;

  const isMainPhase = view.currentPhase === "main" || view.currentPhase === "main2";
  const board = view.board;
  const hand = view.hand;
  const stZone = view.spellTrapZone;
  const opponentBoard = view.opponentBoard;

  if (isMainPhase) {
    if (board.length < 5) {
      for (const cardId of hand) {
        const card = cardLookup[cardId];
        if (!card) continue;
        if (card.cardType === "stereotype" || card.type === "stereotype") {
          const level = card.level ?? 0;
          const needsTribute = level >= 5;
          va.canSummon.set(cardId, { positions: ["attack", "defense"], needsTribute });
          va.canSetMonster.add(cardId);
        }
      }
    }

    if (stZone.length < 5) {
      for (const cardId of hand) {
        const card = cardLookup[cardId];
        if (!card) continue;
        if (card.cardType === "spell" || card.type === "spell") {
          va.canSetSpellTrap.add(cardId);
          va.canActivateSpell.add(cardId);
        }
        if (card.cardType === "trap" || card.type === "trap") {
          va.canSetSpellTrap.add(cardId);
        }
      }
    }

    for (const stCard of stZone) {
      if (!stCard.faceDown) continue;
      const card = cardLookup[stCard.definitionId];
      if (!card) continue;
      if (card.type === "spell" || card.cardType === "spell") {
        va.canActivateSpell.add(stCard.cardId);
      }
      if (card.type === "trap" || card.cardType === "trap") {
        va.canActivateTrap.add(stCard.cardId);
      }
    }

    for (const boardCard of board) {
      if (boardCard.faceDown && boardCard.turnSummoned < view.turnNumber) {
        va.canFlipSummon.add(boardCard.cardId);
      }
    }
  }

  if (view.currentPhase === "combat" && view.turnNumber > 1) {
    for (const monster of board) {
      if (monster.faceDown || !monster.canAttack || monster.hasAttackedThisTurn) continue;
      const targets: string[] = [];
      for (const opponentMonster of opponentBoard) {
        targets.push(opponentMonster.cardId);
      }
      const hasFaceUpOpponent = opponentBoard.some((card) => !card.faceDown);
      if (!hasFaceUpOpponent) targets.push("");
      va.canAttack.set(monster.cardId, targets);
    }
  }

  return va;
}

export function useGameState(matchId: string | undefined, seat: Seat) {
  const meta = useConvexQuery(
    api.game.getMatchMeta,
    matchId ? { matchId } : "skip",
  ) as MatchMeta | null | undefined;

  const viewJson = useConvexQuery(
    api.game.getPlayerView,
    matchId && seat ? { matchId, seat } : "skip",
  ) as string | null | undefined;

  const openPromptRaw = useConvexQuery(
    api.game.getOpenPrompt,
    matchId && seat ? { matchId, seat } : "skip",
  ) as unknown | undefined | null;

  const allCards = useConvexQuery(api.game.getAllCards, {}) as CardDefinition[] | undefined;

  const view = useMemo<PlayerView | null>(() => parsePlayerView(viewJson), [viewJson]);

  const openPrompt = useMemo<ParsedOpenPrompt | null>(
    () => parseOpenPrompt(openPromptRaw),
    [openPromptRaw],
  );

  const cardLookup = useMemo<Record<string, CardDefinition>>(() => {
    if (!allCards) return {};
    const map: Record<string, CardDefinition> = {};
    for (const card of allCards) {
      map[card._id] = card;
    }
    return map;
  }, [allCards]);

  const isMyTurn = view?.currentTurnPlayer === view?.mySeat;
  const isChainResponder = view?.currentPriorityPlayer === view?.mySeat;
  const phase = view?.currentPhase ?? "draw";
  const gameOver = view?.gameOver ?? false;
  const isChainWindow = (view?.currentChain?.length ?? 0) > 0;

  const validActions = useMemo(
    () =>
      deriveValidActions({
        view,
        cardLookup,
        isMyTurn,
        isChainWindow,
        isChainResponder,
        gameOver,
      }),
    [view, isMyTurn, isChainWindow, isChainResponder, gameOver, cardLookup],
  );

  return {
    meta,
    seat,
    view,
    openPrompt,
    cardLookup,
    isMyTurn,
    isChainResponder,
    phase,
    gameOver,
    validActions,
    isLoading: meta === undefined || viewJson === undefined,
    notFound: meta === null,
  };
}

function parsePlayerView(value: string | null | undefined): PlayerView | null {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const currentTurnPlayer = asSeat(parsed.currentTurnPlayer) ?? "host";
  const mySeat = asSeat(parsed.mySeat) ?? currentTurnPlayer;
  const opponentSeat: Seat = mySeat === "host" ? "away" : "host";

  const players = normalizePlayers(parsed.players);
  const legacyLifePoints = normalizeLifePointMap(parsed.lifePoints);

  const lifePoints =
    toFiniteNumber(parsed.lifePoints) ??
    lifeFromPlayers(players, mySeat) ??
    legacyLifePoints?.[mySeat] ??
    8000;
  const opponentLifePoints =
    toFiniteNumber(parsed.opponentLifePoints) ??
    lifeFromPlayers(players, opponentSeat) ??
    legacyLifePoints?.[opponentSeat] ??
    8000;

  const phase = asPhase(parsed.currentPhase) ?? "draw";
  const winner = asSeat(parsed.winner);

  return {
    hand: toStringArray(parsed.hand),
    board: normalizeBoardCards(parsed.board),
    spellTrapZone: normalizeSpellTrapCards(parsed.spellTrapZone),
    fieldSpell: normalizeSpellTrapCard(parsed.fieldSpell),
    graveyard: toStringArray(parsed.graveyard),
    banished: toStringArray(parsed.banished),
    lifePoints,
    deckCount: toFiniteNumber(parsed.deckCount) ?? 0,
    breakdownsCaused: toFiniteNumber(parsed.breakdownsCaused) ?? 0,
    opponentHandCount: toFiniteNumber(parsed.opponentHandCount) ?? 0,
    opponentBoard: normalizeBoardCards(parsed.opponentBoard),
    opponentSpellTrapZone: normalizeSpellTrapCards(parsed.opponentSpellTrapZone),
    opponentFieldSpell: normalizeSpellTrapCard(parsed.opponentFieldSpell),
    opponentGraveyard: toStringArray(parsed.opponentGraveyard),
    opponentBanished: toStringArray(parsed.opponentBanished),
    opponentLifePoints,
    opponentDeckCount: toFiniteNumber(parsed.opponentDeckCount) ?? 0,
    opponentBreakdownsCaused: toFiniteNumber(parsed.opponentBreakdownsCaused) ?? 0,
    currentTurnPlayer,
    currentPriorityPlayer: asSeat(parsed.currentPriorityPlayer),
    turnNumber: toFiniteNumber(parsed.turnNumber) ?? 1,
    currentPhase: phase,
    currentChain: normalizeChainLinks(parsed.currentChain),
    mySeat,
    gameOver: parsed.gameOver === true,
    winner,
    winReason: asWinReason(parsed.winReason),
    players,
    turnPlayer: asSeat(parsed.turnPlayer) ?? currentTurnPlayer,
    gameResult: typeof parsed.gameResult === "string" ? parsed.gameResult : undefined,
  };
}

function parseOpenPrompt(value: unknown): ParsedOpenPrompt | null {
  if (!value) return null;

  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  const prompt = normalizeOpenPrompt(parsed);
  if (!prompt) return null;
  const normalizedData = parsePromptData(prompt.data);

  return {
    ...prompt,
    data: normalizedData,
  };
}

function normalizeOpenPrompt(value: unknown): OpenPrompt | null {
  if (!isRecord(value)) return null;

  const id = toString(value._id);
  const matchId = toString(value.matchId);
  const seat = asSeat(value.seat);
  const promptType = asPromptType(value.promptType);
  if (!id || !matchId || !seat || !promptType) return null;
  const data = typeof value.data === "string" ? value.data : undefined;

  return {
    _id: id,
    _creationTime: toFiniteNumber(value._creationTime) ?? Date.now(),
    matchId,
    seat,
    promptType,
    data,
    resolved: value.resolved === true,
    createdAt: toFiniteNumber(value.createdAt) ?? Date.now(),
    resolvedAt: toFiniteNumber(value.resolvedAt) ?? undefined,
  };
}

function normalizeBoardCards(value: unknown): GameCardInstance[] {
  if (!Array.isArray(value)) return [];
  const cards: GameCardInstance[] = [];
  for (const entry of value) {
    const normalized = normalizeBoardCard(entry);
    if (normalized) cards.push(normalized);
  }
  return cards;
}

function normalizeBoardCard(value: unknown): GameCardInstance | null {
  if (!isRecord(value)) return null;
  const cardId = toString(value.cardId);
  const definitionId = toString(value.definitionId);
  if (!cardId || !definitionId) return null;

  const boosts = isRecord(value.temporaryBoosts) ? value.temporaryBoosts : null;

  return {
    cardId,
    definitionId,
    position: value.position === "defense" ? "defense" : "attack",
    faceDown: value.faceDown === true,
    canAttack: value.canAttack === true,
    hasAttackedThisTurn: value.hasAttackedThisTurn === true,
    changedPositionThisTurn: value.changedPositionThisTurn === true,
    viceCounters: toFiniteNumber(value.viceCounters) ?? 0,
    temporaryBoosts: {
      attack: boosts ? toFiniteNumber(boosts.attack) ?? 0 : 0,
      defense: boosts ? toFiniteNumber(boosts.defense) ?? 0 : 0,
    },
    equippedCards: toStringArray(value.equippedCards),
    turnSummoned: toFiniteNumber(value.turnSummoned) ?? 0,
  };
}

function normalizeSpellTrapCards(value: unknown): GameSpellTrapInstance[] {
  if (!Array.isArray(value)) return [];
  const cards: GameSpellTrapInstance[] = [];
  for (const entry of value) {
    const normalized = normalizeSpellTrapCard(entry);
    if (normalized) cards.push(normalized);
  }
  return cards;
}

function normalizeSpellTrapCard(value: unknown): GameSpellTrapInstance | null {
  if (!isRecord(value)) return null;
  const cardId = toString(value.cardId);
  const definitionId = toString(value.definitionId);
  if (!cardId || !definitionId) return null;

  return {
    cardId,
    definitionId,
    faceDown: value.faceDown === true,
    activated: value.activated === true,
    isFieldSpell: value.isFieldSpell === true ? true : undefined,
  };
}

function normalizeChainLinks(value: unknown): NonNullable<PlayerView["currentChain"]> {
  if (!Array.isArray(value)) return [];
  const links: NonNullable<PlayerView["currentChain"]> = [];

  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const cardId = toString(entry.cardId);
    const activatingPlayer = asSeat(entry.activatingPlayer);
    if (!cardId || !activatingPlayer) continue;

    links.push({
      cardId,
      effectIndex: toFiniteNumber(entry.effectIndex) ?? 0,
      activatingPlayer,
      targets: toStringArray(entry.targets),
    });
  }

  return links;
}

function normalizePlayers(value: unknown): PlayerView["players"] {
  if (!isRecord(value)) return undefined;
  const host = isRecord(value.host) ? value.host : null;
  const away = isRecord(value.away) ? value.away : null;
  return {
    host: { lifePoints: host ? toFiniteNumber(host.lifePoints) ?? undefined : undefined },
    away: { lifePoints: away ? toFiniteNumber(away.lifePoints) ?? undefined : undefined },
  };
}

function normalizeLifePointMap(value: unknown): Record<Seat, number> | null {
  if (!isRecord(value)) return null;
  const host = toFiniteNumber(value.host);
  const away = toFiniteNumber(value.away);
  if (host === null || away === null) return null;
  return { host, away };
}

function lifeFromPlayers(
  players: PlayerView["players"],
  seat: Seat,
): number | null {
  if (!players) return null;
  const lifePoints = seat === "host" ? players.host?.lifePoints : players.away?.lifePoints;
  return typeof lifePoints === "number" ? lifePoints : null;
}

function parsePromptData(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asSeat(value: unknown): Seat | null {
  return value === "host" || value === "away" ? value : null;
}

function asPhase(value: unknown): PlayerView["currentPhase"] | null {
  switch (value) {
    case "draw":
    case "standby":
    case "breakdown_check":
    case "main":
    case "combat":
    case "main2":
    case "end":
      return value;
    default:
      return null;
  }
}

function asWinReason(value: unknown): PlayerView["winReason"] {
  switch (value) {
    case "lp_zero":
    case "deck_out":
    case "breakdown":
    case "surrender":
      return value;
    default:
      return null;
  }
}

function asPromptType(value: unknown): OpenPrompt["promptType"] | null {
  switch (value) {
    case "chain_response":
    case "optional_trigger":
    case "replay_decision":
    case "discard":
      return value;
    default:
      return null;
  }
}

function toString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
