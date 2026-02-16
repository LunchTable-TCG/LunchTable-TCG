/**
 * Route: GET /api/status
 *
 * Health/status endpoint for monitoring the LTCG plugin.
 * Exposed at /{pluginName}/api/status by ElizaOS.
 *
 * Returns:
 * - plugin name and version
 * - connection status to the LTCG API
 * - current match state (if any)
 * - agent info
 */

import { getClient } from "../client.js";
import { resolveLifePoints, resolvePhase } from "../shared/gameView.js";
import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "../types.js";

export const statusRoute: Route = {
  type: "GET",
  path: "/api/status",
  public: true,
  name: "ltcg-status",

  handler: async (
    _req: RouteRequest,
    res: RouteResponse,
    runtime: IAgentRuntime,
  ) => {
    try {
      const client = getClient();
      const matchId = client.currentMatchId;
      const soundtrackEndpoint =
        runtime.getSetting("LTCG_SOUNDTRACK_API_URL") ||
        process.env.LTCG_SOUNDTRACK_API_URL ||
        null;

      const status: Record<string, unknown> = {
        plugin: "ltcg",
        status: "ok",
        connected: true,
        hasActiveMatch: client.hasActiveMatch,
        matchId: matchId ?? null,
        timestamp: Date.now(),
        soundtrack: {
          configured: Boolean(soundtrackEndpoint),
          endpoint: soundtrackEndpoint,
        },
      };

      if (matchId) {
        try {
          const view = await client.getView(matchId, "host");
          const phase = resolvePhase(view);
          const { myLP, oppLP } = resolveLifePoints(view);
          const handSize = Array.isArray(view.hand) ? view.hand.length : 0;

          status.match = {
            phase,
            gameOver: view.gameOver,
            isMyTurn: view.currentTurnPlayer === "host",
            myLP,
            oppLP,
            handSize,
          };
        } catch {
          status.match = { error: "Unable to fetch match state" };
        }
      }

      try {
        const me = await client.getMe();
        status.agent = {
          name: me.name,
          id: me.id,
          apiKeyPrefix: me.apiKeyPrefix,
        };
      } catch {
        status.agent = null;
      }

      res.status(200).json(status);
    } catch {
      res.status(503).json({
        plugin: "ltcg",
        status: "disconnected",
        connected: false,
        hasActiveMatch: false,
        matchId: null,
        timestamp: Date.now(),
      });
    }
  },
};

