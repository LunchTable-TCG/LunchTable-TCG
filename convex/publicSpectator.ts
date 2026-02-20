type Seat = "host" | "away";

type CardDefinitionLike = {
  name?: string;
  attack?: number;
  defense?: number;
  type?: string;
  cardType?: string;
};

type CardLookup = Record<string, CardDefinitionLike>;

type PlayerViewLike = {
  currentTurnPlayer?: unknown;
  currentPhase?: unknown;
  turnNumber?: unknown;
  gameOver?: unknown;
  winner?: unknown;
  maxBoardSlots?: unknown;
  maxSpellTrapSlots?: unknown;
  hand?: unknown;
  opponentHandCount?: unknown;
  board?: unknown;
  opponentBoard?: unknown;
  spellTrapZone?: unknown;
  opponentSpellTrapZone?: unknown;
  lifePoints?: unknown;
  opponentLifePoints?: unknown;
  deckCount?: unknown;
  opponentDeckCount?: unknown;
  graveyard?: unknown;
  opponentGraveyard?: unknown;
  banished?: unknown;
  opponentBanished?: unknown;
};

type BoardCardLike = {
  definitionId?: unknown;
  faceDown?: unknown;
  position?: unknown;
};

type EventBatchLike = {
  version?: unknown;
  createdAt?: unknown;
  events?: unknown;
  seat?: unknown;
};

type EngineEventLike = {
  type?: unknown;
};

export type PublicSpectatorSlot = {
  lane: number;
  occupied: boolean;
  faceDown: boolean;
  position: "attack" | "defense" | null;
  name: string | null;
  attack: number | null;
  defense: number | null;
  kind: "monster" | "spell" | "trap" | "card" | null;
  definitionId: string | null;
};

export type PublicSpectatorView = {
  matchId: string;
  seat: Seat;
  status: string | null;
  mode: string | null;
  phase: string;
  turnNumber: number;
  gameOver: boolean;
  winner: Seat | null;
  isAgentTurn: boolean;
  chapterId: string | null;
  stageNumber: number | null;
  players: {
    agent: {
      lifePoints: number;
      deckCount: number;
      handCount: number;
      graveyardCount: number;
      banishedCount: number;
    };
    opponent: {
      lifePoints: number;
      deckCount: number;
      handCount: number;
      graveyardCount: number;
      banishedCount: number;
    };
  };
  fields: {
    agent: {
      monsters: PublicSpectatorSlot[];
      spellTraps: PublicSpectatorSlot[];
    };
    opponent: {
      monsters: PublicSpectatorSlot[];
      spellTraps: PublicSpectatorSlot[];
    };
  };
};

export type PublicEventLogEntry = {
  version: number;
  createdAt: number | null;
  actor: "agent" | "opponent" | "system";
  eventType: string;
  summary: string;
  rationale: string;
};

function toSeat(value: unknown): Seat | null {
  if (value === "host" || value === "away") return value;
  return null;
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function toBooleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function toArrayValue<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toBoardSlots(
  cards: BoardCardLike[],
  cardLookup: CardLookup,
  maxSlots: number,
): PublicSpectatorSlot[] {
  const slots: PublicSpectatorSlot[] = [];

  for (let lane = 0; lane < maxSlots; lane += 1) {
    const raw = cards[lane];
    if (!raw) {
      slots.push({
        lane,
        occupied: false,
        faceDown: false,
        position: null,
        name: null,
        attack: null,
        defense: null,
        kind: null,
        definitionId: null,
      });
      continue;
    }

    const faceDown = toBooleanValue(raw.faceDown, false);
    const definitionId = toStringValue(raw.definitionId);
    const definition =
      definitionId && definitionId !== "hidden" ? cardLookup[definitionId] : undefined;
    const isMonster =
      (definition?.cardType === "stereotype" || definition?.type === "stereotype") &&
      !faceDown;
    const name = faceDown ? null : definition?.name ?? "Card";

    slots.push({
      lane,
      occupied: true,
      faceDown,
      position: raw.position === "defense" ? "defense" : "attack",
      name,
      attack: isMonster ? toNumberValue(definition?.attack, 0) : null,
      defense: isMonster ? toNumberValue(definition?.defense, 0) : null,
      kind: isMonster ? "monster" : faceDown ? "card" : "card",
      definitionId: faceDown ? null : definitionId,
    });
  }

  return slots;
}

function toSpellTrapSlots(
  cards: BoardCardLike[],
  cardLookup: CardLookup,
  maxSlots: number,
): PublicSpectatorSlot[] {
  const slots: PublicSpectatorSlot[] = [];

  for (let lane = 0; lane < maxSlots; lane += 1) {
    const raw = cards[lane];
    if (!raw) {
      slots.push({
        lane,
        occupied: false,
        faceDown: false,
        position: null,
        name: null,
        attack: null,
        defense: null,
        kind: null,
        definitionId: null,
      });
      continue;
    }

    const faceDown = toBooleanValue(raw.faceDown, false);
    const definitionId = toStringValue(raw.definitionId);
    const definition =
      definitionId && definitionId !== "hidden" ? cardLookup[definitionId] : undefined;
    const typeValue = definition?.type ?? definition?.cardType;
    const kind: PublicSpectatorSlot["kind"] =
      typeValue === "trap" ? "trap" : typeValue === "spell" ? "spell" : "card";

    slots.push({
      lane,
      occupied: true,
      faceDown,
      position: null,
      name: faceDown ? null : definition?.name ?? "Card",
      attack: null,
      defense: null,
      kind,
      definitionId: faceDown ? null : definitionId,
    });
  }

  return slots;
}

export function buildPublicSpectatorView(input: {
  matchId: string;
  seat: Seat;
  status?: string | null;
  mode?: string | null;
  view: PlayerViewLike;
  cardLookup: CardLookup;
  chapterId?: string | null;
  stageNumber?: number | null;
}): PublicSpectatorView {
  const turnPlayer = toSeat(input.view.currentTurnPlayer);
  const seat = input.seat;
  const maxBoardSlots = Math.max(1, toNumberValue(input.view.maxBoardSlots, 3));
  const maxSpellTrapSlots = Math.max(1, toNumberValue(input.view.maxSpellTrapSlots, 3));

  const myHand = toArrayValue(input.view.hand);
  const oppHandCount = toNumberValue(input.view.opponentHandCount, 0);
  const myBoard = toArrayValue<BoardCardLike>(input.view.board);
  const oppBoard = toArrayValue<BoardCardLike>(input.view.opponentBoard);
  const mySpellTrapZone = toArrayValue<BoardCardLike>(input.view.spellTrapZone);
  const oppSpellTrapZone = toArrayValue<BoardCardLike>(input.view.opponentSpellTrapZone);

  const myGraveyardCount = toArrayValue(input.view.graveyard).length;
  const oppGraveyardCount = toArrayValue(input.view.opponentGraveyard).length;
  const myBanishedCount = toArrayValue(input.view.banished).length;
  const oppBanishedCount = toArrayValue(input.view.opponentBanished).length;

  return {
    matchId: input.matchId,
    seat,
    status: input.status ?? null,
    mode: input.mode ?? null,
    phase: toStringValue(input.view.currentPhase) ?? "draw",
    turnNumber: Math.max(1, toNumberValue(input.view.turnNumber, 1)),
    gameOver: toBooleanValue(input.view.gameOver, false),
    winner: toSeat(input.view.winner),
    isAgentTurn: turnPlayer === seat,
    chapterId: input.chapterId ?? null,
    stageNumber: input.stageNumber ?? null,
    players: {
      agent: {
        lifePoints: toNumberValue(input.view.lifePoints, 0),
        deckCount: toNumberValue(input.view.deckCount, 0),
        handCount: myHand.length,
        graveyardCount: myGraveyardCount,
        banishedCount: myBanishedCount,
      },
      opponent: {
        lifePoints: toNumberValue(input.view.opponentLifePoints, 0),
        deckCount: toNumberValue(input.view.opponentDeckCount, 0),
        handCount: Math.max(0, oppHandCount),
        graveyardCount: oppGraveyardCount,
        banishedCount: oppBanishedCount,
      },
    },
    fields: {
      agent: {
        monsters: toBoardSlots(myBoard, input.cardLookup, maxBoardSlots),
        spellTraps: toSpellTrapSlots(mySpellTrapZone, input.cardLookup, maxSpellTrapSlots),
      },
      opponent: {
        monsters: toBoardSlots(oppBoard, input.cardLookup, maxBoardSlots),
        spellTraps: toSpellTrapSlots(oppSpellTrapZone, input.cardLookup, maxSpellTrapSlots),
      },
    },
  };
}

function actorFromSeat(seat: unknown, agentSeat: Seat): "agent" | "opponent" | "system" {
  const normalized = toSeat(seat);
  if (!normalized) return "system";
  return normalized === agentSeat ? "agent" : "opponent";
}

function normalizeEventType(value: unknown): string {
  const asText = toStringValue(value);
  return asText ?? "UNKNOWN";
}

function summaryForEvent(type: string, actor: "agent" | "opponent" | "system"): string {
  const actorLabel = actor === "agent" ? "Agent" : actor === "opponent" ? "Opponent" : "System";

  switch (type) {
    case "TURN_STARTED":
      return `${actorLabel} turn started`;
    case "TURN_ENDED":
      return `${actorLabel} turn ended`;
    case "PHASE_CHANGED":
      return "Phase advanced";
    case "CARD_DRAWN":
      return `${actorLabel} drew a card`;
    case "MONSTER_SUMMONED":
      return `${actorLabel} summoned a monster`;
    case "MONSTER_SET":
      return `${actorLabel} set a monster`;
    case "SPELL_TRAP_SET":
      return `${actorLabel} set a spell/trap`;
    case "SPELL_ACTIVATED":
    case "TRAP_ACTIVATED":
      return `${actorLabel} activated a card`;
    case "EFFECT_ACTIVATED":
      return `${actorLabel} activated an effect`;
    case "ATTACK_DECLARED":
      return `${actorLabel} declared an attack`;
    case "DAMAGE_DEALT":
      return "Damage was dealt";
    case "CARD_DESTROYED":
      return "A card was destroyed";
    case "CHAIN_STARTED":
      return "Chain started";
    case "CHAIN_RESOLVED":
      return "Chain resolved";
    case "GAME_ENDED":
      return "Game ended";
    default:
      return `${actorLabel} resolved an action`;
  }
}

function rationaleForEvent(type: string): string {
  switch (type) {
    case "MONSTER_SUMMONED":
    case "MONSTER_SET":
      return "Develop board presence and pressure future turns.";
    case "SPELL_TRAP_SET":
      return "Prepare interaction for later turns.";
    case "SPELL_ACTIVATED":
    case "TRAP_ACTIVATED":
    case "EFFECT_ACTIVATED":
      return "Use card value at the current timing window.";
    case "ATTACK_DECLARED":
      return "Convert board advantage into life-point pressure.";
    case "DAMAGE_DEALT":
      return "Shift the life-point race.";
    case "TURN_ENDED":
      return "Pass priority after completing available plays.";
    case "GAME_ENDED":
      return "A win condition was reached.";
    default:
      return "Advance the game state safely.";
  }
}

function parseEvents(raw: unknown): EngineEventLike[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as EngineEventLike[]) : [];
  } catch {
    return [];
  }
}

export function buildPublicEventLog(input: {
  batches: EventBatchLike[];
  agentSeat: Seat;
}): PublicEventLogEntry[] {
  const result: PublicEventLogEntry[] = [];

  for (const batch of input.batches) {
    const version = toNumberValue(batch.version, 0);
    const createdAt =
      typeof batch.createdAt === "number" && Number.isFinite(batch.createdAt)
        ? batch.createdAt
        : null;
    const actor = actorFromSeat(batch.seat, input.agentSeat);
    const events = parseEvents(batch.events);

    if (events.length === 0) {
      result.push({
        version,
        createdAt,
        actor,
        eventType: "ACTION_RESOLVED",
        summary: summaryForEvent("ACTION_RESOLVED", actor),
        rationale: rationaleForEvent("ACTION_RESOLVED"),
      });
      continue;
    }

    for (const event of events) {
      const eventType = normalizeEventType(event?.type);
      result.push({
        version,
        createdAt,
        actor,
        eventType,
        summary: summaryForEvent(eventType, actor),
        rationale: rationaleForEvent(eventType),
      });
    }
  }

  return result;
}
