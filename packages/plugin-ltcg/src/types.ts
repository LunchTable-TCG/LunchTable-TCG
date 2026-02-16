/**
 * Type definitions for @lunchtable-tcg/plugin-ltcg
 *
 * Includes:
 * - ElizaOS plugin interface types (structurally compatible — no @elizaos/core needed)
 * - LTCG game API response types (matching convex/http.ts endpoints)
 */

// ── ElizaOS Plugin Interface ─────────────────────────────────────
// Structural types matching @elizaos/core v2 (1.7.x).
// At runtime, ElizaOS provides the real implementations.

export interface Memory {
  content: {
    text?: string;
    action?: string;
    source?: string;
    [key: string]: unknown;
  };
  entityId?: string;
  roomId?: string;
  [key: string]: unknown;
}

export type State = Record<string, unknown>;

export type Content = {
  text?: string;
  action?: string;
  [key: string]: unknown;
};

/** Callback for action handlers to send messages to the user */
export type HandlerCallback = (response: Content) => Promise<Memory[]>;

/** Return type for action handlers */
export interface ActionResult {
  success: boolean;
  text?: string;
  data?: unknown;
  error?: string;
}

export interface IAgentRuntime {
  agentId: string;
  getSetting(key: string): string | undefined;
  getService<T>(type: string): T | null;
  registerEvent(event: string, handler: EventHandler): void;
  emitEvent(event: string, payload: unknown): Promise<void>;
  [key: string]: unknown;
}

export interface Action {
  name: string;
  description: string;
  similes?: string[];
  examples?: Array<Array<{ name: string; content: Content }>>;
  validate(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
  ): Promise<boolean>;
  handler(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
    responses?: Memory[],
  ): Promise<ActionResult | void | undefined>;
}

export interface Provider {
  name?: string;
  description?: string;
  get(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
  ): Promise<Content>;
}

// ── Route types ──────────────────────────────────────────────────

export interface RouteRequest {
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  url?: string;
}

export interface RouteResponse {
  status(code: number): RouteResponse;
  json(data: unknown): RouteResponse;
  send(data: unknown): RouteResponse;
  end(): RouteResponse;
  setHeader?(name: string, value: string | string[]): RouteResponse;
  headersSent?: boolean;
}

export interface Route {
  type: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "STATIC";
  path: string;
  public?: boolean;
  name?: string;
  handler?: (
    req: RouteRequest,
    res: RouteResponse,
    runtime: IAgentRuntime,
  ) => Promise<void>;
}

// ── Event types ──────────────────────────────────────────────────

export type EventHandler<_K = unknown> = (
  payload: Record<string, unknown>,
  runtime: IAgentRuntime,
) => Promise<void>;

export type PluginEvents = {
  [event: string]: EventHandler[];
};

// ── Plugin interface ─────────────────────────────────────────────

export interface Plugin {
  name: string;
  description: string;
  config?: Record<string, string | number | boolean | null | undefined>;
  init?(
    config: Record<string, string>,
    runtime: IAgentRuntime,
  ): Promise<void>;
  actions?: Action[];
  providers?: Provider[];
  evaluators?: unknown[];
  services?: unknown[];
  routes?: Route[];
  events?: PluginEvents;
  priority?: number;
  dependencies?: string[];
}

// ── LTCG Agent API Types ─────────────────────────────────────────
// Match the response shapes from convex/http.ts endpoints.

/** GET /api/agent/me */
export interface AgentInfo {
  id: string;
  name: string;
  userId: string;
  apiKeyPrefix: string;
  isActive: boolean;
  createdAt: number;
}

/** GET /api/agent/game/chapters (array) */
export interface Chapter {
  _id: string;
  title?: string;
  name?: string;
  description?: string;
}

/** GET /api/agent/game/starter-decks (array) */
export interface StarterDeck {
  deckCode: string;
  name: string;
  archetype?: string;
  description?: string;
}

/** Card in the player's hand (from PlayerView.hand) */
export interface CardInHand {
  instanceId: string;
  cardId?: string;
  cardType: "stereotype" | "spell" | "trap";
  name: string;
  attack?: number;
  defense?: number;
  level?: number;
  description?: string;
}

/** Card on the game field */
export interface BoardCard {
  instanceId: string;
  name: string;
  attack: number;
  defense: number;
  position?: "attack" | "defense";
  faceDown?: boolean;
}

/** GET /api/agent/game/view */
export interface PlayerView {
  gameOver: boolean;
  phase:
    | "draw"
    | "standby"
    | "main"
    | "combat"
    | "main2"
    | "breakdown_check"
    | "end";
  currentTurnPlayer: "host" | "away";
  players: {
    host: { lifePoints: number };
    away: { lifePoints: number };
  };
  hand: CardInHand[];
  playerField: {
    monsters: (BoardCard | null)[];
    spellTraps?: (unknown | null)[];
  };
  opponentField: {
    monsters: (BoardCard | null)[];
    spellTraps?: (unknown | null)[];
  };
}

/** GET /api/agent/game/match-status */
export interface MatchStatus {
  matchId: string;
  status: string;
  mode: string;
  winner: string | null;
  endReason: string | null;
  isGameOver: boolean;
  chapterId: string | null;
  stageNumber: number | null;
  outcome: string | null;
  starsEarned: number | null;
}

// ── Story Mode Types ─────────────────────────────────────────────

/** Stage progress for a single stage */
export interface StageProgress {
  stageId: string;
  chapterId: string;
  stageNumber: number;
  status: "completed" | "starred" | "locked";
  starsEarned: number;
  timesCompleted: number;
}

/** GET /api/agent/story/progress */
export interface StoryProgress {
  chapters: Chapter[];
  chapterProgress: Array<{
    chapterId: string;
    status: string;
  }>;
  stageProgress: StageProgress[];
  totalStars: number;
}

/** GET /api/agent/story/stage */
export interface StageData {
  _id: string;
  chapterId: string;
  stageNumber: number;
  opponentName: string;
  rewardGold?: number;
  rewardXp?: number;
  firstClearBonus?: number;
  narrative: {
    preMatchDialogue: string[];
    postMatchWinDialogue: string[];
    postMatchLoseDialogue: string[];
  };
}

/** POST /api/agent/story/complete-stage */
export interface StageCompletionResult {
  outcome: "won" | "lost";
  starsEarned: number;
  rewards: {
    gold: number;
    xp: number;
    firstClearBonus: number;
  };
}

/** Commands sent via POST /api/agent/game/action */
export type GameCommand =
  | { type: "SUMMON"; cardInstanceId: string; position: "attack" | "defense" }
  | { type: "SET_MONSTER"; cardInstanceId: string }
  | { type: "ACTIVATE_SPELL"; cardInstanceId: string }
  | { type: "ACTIVATE_TRAP"; cardInstanceId: string }
  | {
      type: "DECLARE_ATTACK";
      attackerInstanceId: string;
      targetInstanceId?: string;
    }
  | { type: "ADVANCE_PHASE" }
  | { type: "END_TURN" }
  | {
      type: "CHANGE_POSITION";
      cardInstanceId: string;
      newPosition: string;
    }
  | { type: "FLIP_SUMMON"; cardInstanceId: string }
  | { type: "CHAIN_RESPONSE"; responseType: string }
  | { type: "SURRENDER" };
