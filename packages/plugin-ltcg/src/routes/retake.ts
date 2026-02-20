/**
 * Route: GET /api/retake/status
 *
 * Monitoring endpoint for retake.tv streaming integration.
 * Returns configuration status and live stream info if available.
 */

import { getRetakeClient } from "../retake-client.js";
import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "../types.js";

export const retakeStatusRoute: Route = {
  type: "GET",
  path: "/api/retake/status",
  public: true,
  name: "retake-status",
  handler: async (
    _req: RouteRequest,
    res: RouteResponse,
    _runtime: IAgentRuntime,
  ) => {
    const client = getRetakeClient();

    if (!client) {
      res.status(200).json({
        configured: false,
        message: "RETAKE_API_URL not set — streaming disabled",
      });
      return;
    }

    const status: Record<string, unknown> = {
      configured: true,
      registered: client.hasToken,
      timestamp: Date.now(),
    };

    if (client.hasToken) {
      try {
        const stream = await client.getStreamStatus();
        status.is_live = stream.is_live;
        status.viewers = stream.viewers;
        status.uptime_seconds = stream.uptime_seconds;
        status.token_address = stream.token_address;
      } catch {
        status.is_live = null;
        status.viewers = null;
        status.stream_error = "Unable to fetch stream status";
      }
    }

    res.status(200).json(status);
  },
};
