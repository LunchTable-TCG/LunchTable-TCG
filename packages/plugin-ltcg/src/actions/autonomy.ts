/**
 * Actions: LTCG autonomy controller
 *
 * Provides deterministic start/pause/resume/stop for continuous story or PvP runs.
 * This is designed for host UIs (e.g. milady) to control the agent without going
 * through the LLM message pipeline.
 */

import { getAutonomyController } from "../autonomy/controller.js";
import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "../types.js";

type AutonomyMode = "story" | "pvp";

function clampMode(value: unknown): AutonomyMode | null {
  return value === "story" || value === "pvp" ? value : null;
}

export const runAutonomyAction: Action = {
  name: "RUN_LTCG_AUTONOMOUS",
  similes: ["START_LTCG_AUTONOMY", "AUTO_PLAY_LTCG", "RUN_LTCG"],
  description:
    "Start autonomous LunchTable gameplay. mode: story|pvp. continuous: true to keep running until stopped.",

  validate: async () => getAutonomyController().getStatus().state === "idle",

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const controller = getAutonomyController();
    const requestedMode =
      clampMode(options?.mode) ??
      (typeof options?.mode === "string" && options.mode.toLowerCase() === "duel"
        ? "pvp"
        : null) ??
      "story";
    const continuous =
      typeof options?.continuous === "boolean" ? options.continuous : true;

    await controller.start({ mode: requestedMode, continuous });

    const status = controller.getStatus();
    const text = `Autonomy started (${requestedMode}, continuous=${String(continuous)}).`;
    if (callback) await callback({ text, action: "RUN_LTCG_AUTONOMOUS" });
    return { success: true, data: status };
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Run LunchTable autonomously" } },
      {
        name: "{{agent}}",
        content: { text: "Starting autonomy now.", action: "RUN_LTCG_AUTONOMOUS" },
      },
    ],
  ],
};

export const pauseAutonomyAction: Action = {
  name: "PAUSE_LTCG_AUTONOMY",
  similes: ["PAUSE_AUTONOMY", "PAUSE_LTCG"],
  description: "Pause an active LTCG autonomy run.",
  validate: async () => getAutonomyController().getStatus().state === "running",
  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const controller = getAutonomyController();
    await controller.pause();
    const status = controller.getStatus();
    if (callback) await callback({ text: "Autonomy paused." });
    return { success: true, data: status };
  },
  examples: [],
};

export const resumeAutonomyAction: Action = {
  name: "RESUME_LTCG_AUTONOMY",
  similes: ["RESUME_AUTONOMY", "RESUME_LTCG"],
  description: "Resume a paused LTCG autonomy run.",
  validate: async () => getAutonomyController().getStatus().state === "paused",
  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const controller = getAutonomyController();
    await controller.resume();
    const status = controller.getStatus();
    if (callback) await callback({ text: "Autonomy resumed." });
    return { success: true, data: status };
  },
  examples: [],
};

export const stopAutonomyAction: Action = {
  name: "STOP_LTCG_AUTONOMY",
  similes: ["STOP_AUTONOMY", "STOP_LTCG"],
  description: "Stop an active LTCG autonomy run.",
  validate: async () => getAutonomyController().getStatus().state !== "idle",
  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const controller = getAutonomyController();
    await controller.stop();
    const status = controller.getStatus();
    if (callback) await callback({ text: "Autonomy stopped." });
    return { success: true, data: status };
  },
  examples: [],
};

export const getAutonomyStatusAction: Action = {
  name: "GET_LTCG_AUTONOMY_STATUS",
  similes: ["LTCG_AUTONOMY_STATUS", "STATUS_LTCG_AUTONOMY"],
  description: "Get current LTCG autonomy controller status.",
  validate: async () => true,
  handler: async () => {
    const status = getAutonomyController().getStatus();
    return { success: true, data: status };
  },
  examples: [],
};

