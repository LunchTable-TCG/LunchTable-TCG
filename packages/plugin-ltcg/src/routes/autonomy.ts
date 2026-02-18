import { getAutonomyController } from "../autonomy/controller.js";
import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "../types.js";

type AutonomyMode = "story" | "pvp";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampMode(value: unknown): AutonomyMode | null {
  return value === "story" || value === "pvp" ? value : null;
}

export const autonomyStatusRoute: Route = {
  type: "GET",
  path: "/api/ltcg/autonomy/status",
  public: true,
  name: "ltcg-autonomy-status",
  handler: async (_req: RouteRequest, res: RouteResponse, _runtime: IAgentRuntime) => {
    res.status(200).json(getAutonomyController().getStatus());
  },
};

export const autonomyStartRoute: Route = {
  type: "POST",
  path: "/api/ltcg/autonomy/start",
  public: true,
  name: "ltcg-autonomy-start",
  handler: async (req: RouteRequest, res: RouteResponse) => {
    try {
      const body = isRecord(req.body) ? req.body : {};
      const mode = clampMode(body.mode) ?? "story";
      const continuous =
        typeof body.continuous === "boolean" ? body.continuous : true;

      await getAutonomyController().start({ mode, continuous });
      res.status(200).json(getAutonomyController().getStatus());
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

export const autonomyPauseRoute: Route = {
  type: "POST",
  path: "/api/ltcg/autonomy/pause",
  public: true,
  name: "ltcg-autonomy-pause",
  handler: async (_req: RouteRequest, res: RouteResponse) => {
    try {
      await getAutonomyController().pause();
      res.status(200).json(getAutonomyController().getStatus());
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

export const autonomyResumeRoute: Route = {
  type: "POST",
  path: "/api/ltcg/autonomy/resume",
  public: true,
  name: "ltcg-autonomy-resume",
  handler: async (_req: RouteRequest, res: RouteResponse) => {
    try {
      await getAutonomyController().resume();
      res.status(200).json(getAutonomyController().getStatus());
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

export const autonomyStopRoute: Route = {
  type: "POST",
  path: "/api/ltcg/autonomy/stop",
  public: true,
  name: "ltcg-autonomy-stop",
  handler: async (_req: RouteRequest, res: RouteResponse) => {
    try {
      await getAutonomyController().stop();
      res.status(200).json(getAutonomyController().getStatus());
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

