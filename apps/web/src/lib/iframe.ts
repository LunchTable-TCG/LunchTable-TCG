/**
 * milaidy iframe integration
 *
 * Handles postMessage communication between the LTCG game client
 * and the milaidy Electron host app.
 */

// Allowed origins for incoming messages from the host app
// Configure via environment variable: VITE_MILAIDY_ORIGIN
const ALLOWED_ORIGINS = [
  "http://localhost:3000",  // milaidy local dev
  "http://localhost:3334",  // LTCG dev server (self-embed testing)
  "https://milaidy.app",    // Production
  "https://app.milaidy.xyz", // Alternative domain
  "file://",                 // Electron file:// origin
];

// Messages sent from game -> milaidy
export type GameToHost =
  | { type: "LTCG_READY" }
  | { type: "RPG_READY"; schemaVersion: "1.0.0" }
  | { type: "MATCH_STARTED"; matchId: string }
  | { type: "MATCH_ENDED"; result: "win" | "loss" | "draw"; matchId?: string }
  | {
      type: "AUTONOMY_STATUS";
      status: "idle" | "running" | "paused";
      matchId: string | null;
      phase?: string;
      isAgentTurn?: boolean;
      gameOver?: boolean;
      winner?: string | null;
      chapterId?: string | null;
      stageNumber?: number | null;
      timestamp: number;
    }
  | { type: "REQUEST_WALLET" }
  | { type: "STORY_CUTSCENE"; cutsceneId: string; src: string }
  | { type: "STORY_DIALOGUE"; speaker: string; text: string; avatar?: string }
  | { type: "STAGE_COMPLETE"; stageId: string; stars: number; rewards: { gold?: number; xp?: number } }
  | { type: "RPG_SESSION_STARTED"; sessionId: string; worldId: string }
  | { type: "RPG_SESSION_ENDED"; sessionId: string; reason?: string };

// Messages received from milaidy -> game
export type HostToGame =
  | { type: "LTCG_AUTH"; authToken: string; agentId?: string }
  | { type: "AUTH_TOKEN"; authToken: string; agentId?: string }
  | { type: "START_MATCH"; mode: "story" | "pvp" }
  | { type: "WALLET_CONNECTED"; address: string; chain: string }
  | { type: "SKIP_CUTSCENE" }
  | { type: "PAUSE_AUTONOMY" }
  | { type: "RESUME_AUTONOMY" }
  | { type: "STOP_MATCH" }
  | { type: "START_RPG_SESSION"; worldId: string; sessionId?: string; mode?: "2d" | "3d" | "hybrid" };

/**
 * Check if an origin is allowed to communicate with this app.
 */
export function isAllowedOriginForHostMessage(
  origin: string,
  sourceIsParent: boolean,
): boolean {
  const customOrigin = import.meta.env.VITE_MILAIDY_ORIGIN as string | undefined;
  if (customOrigin && origin === customOrigin) return true;

  // Electron and sandboxed iframes may report origin as "null".
  // Only accept those messages from our direct parent window.
  if (origin === "null") return sourceIsParent;

  // file:// origins should also be parent-only for safety.
  if (origin.startsWith("file://")) return sourceIsParent;

  return ALLOWED_ORIGINS.includes(origin);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseHostToGameMessage(data: unknown): HostToGame | null {
  if (!isRecord(data)) return null;
  const type = data.type;
  if (typeof type !== "string") return null;

  switch (type) {
    case "LTCG_AUTH":
    case "AUTH_TOKEN": {
      const authToken =
        typeof data.authToken === "string" ? data.authToken.trim() : "";
      if (!authToken) return null;
      const agentId =
        typeof data.agentId === "string" && data.agentId.trim().length > 0
          ? data.agentId.trim()
          : undefined;
      return { type, authToken, agentId };
    }
    case "START_MATCH": {
      const mode = data.mode;
      if (mode !== "story" && mode !== "pvp") return null;
      return { type, mode };
    }
    case "WALLET_CONNECTED": {
      const address =
        typeof data.address === "string" ? data.address.trim() : "";
      const chain = typeof data.chain === "string" ? data.chain.trim() : "";
      if (!address || !chain) return null;
      return { type, address, chain };
    }
    case "SKIP_CUTSCENE":
    case "PAUSE_AUTONOMY":
    case "RESUME_AUTONOMY":
    case "STOP_MATCH": {
      return { type };
    }
    case "START_RPG_SESSION": {
      const worldId =
        typeof data.worldId === "string" ? data.worldId.trim() : "";
      if (!worldId) return null;
      const sessionId =
        typeof data.sessionId === "string" && data.sessionId.trim().length > 0
          ? data.sessionId.trim()
          : undefined;
      const mode = data.mode;
      const safeMode =
        mode === "2d" || mode === "3d" || mode === "hybrid" ? mode : undefined;
      return { type, worldId, sessionId, mode: safeMode };
    }
    default:
      return null;
  }
}

/**
 * Send a message to the milaidy host app.
 * No-op if not running inside an iframe.
 * 
 * Note: Uses "*" targetOrigin because the game may be embedded
 * in different contexts (local dev, staging, production). The host
 * should validate message source via event.origin.
 */
export function postToHost(message: GameToHost) {
  if (window.self === window.top) return;
  window.parent.postMessage(message, "*");
}

/**
 * Listen for messages from the milaidy host app.
 * Validates message origin before passing to handler.
 * Returns a cleanup function.
 */
export function onHostMessage(
  handler: (message: HostToGame) => void
) {
  const listener = (event: MessageEvent) => {
    const sourceIsParent = event.source === window.parent;

    // Validate origin for security
    if (!isAllowedOriginForHostMessage(event.origin, sourceIsParent)) {
      console.warn(`[iframe] Rejected message from unauthorized origin: ${event.origin}`);
      return;
    }

    const parsed = parseHostToGameMessage(event.data);
    if (parsed) handler(parsed);
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

/**
 * Signal to milaidy that the game client is ready.
 * Call this once on app mount.
 */
export function signalReady() {
  postToHost({ type: "LTCG_READY" });
}
