/**
 * Action: CHECK_RETAKE_STATUS
 *
 * Checks if the agent's retake.tv stream is live and returns viewer count.
 */

import { getRetakeClient } from "../../retake-client.js";
import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "../../types.js";

export const checkRetakeStatusAction: Action = {
  name: "CHECK_RETAKE_STATUS",
  similes: ["RETAKE_STATUS", "STREAM_STATUS", "AM_I_LIVE"],
  description:
    "Check if the agent's retake.tv stream is live and how many viewers are watching.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    const client = getRetakeClient();
    return client !== null && client.hasToken;
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const client = getRetakeClient();
    if (!client || !client.hasToken) {
      const text =
        "retake.tv is not configured or agent is not registered.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    try {
      const status = await client.getStreamStatus();

      const text = status.is_live
        ? `Stream is LIVE with ${status.viewers} viewer${status.viewers === 1 ? "" : "s"} (uptime: ${Math.floor(status.uptime_seconds / 60)}m).`
        : "Stream is offline.";
      if (callback) await callback({ text, action: "CHECK_RETAKE_STATUS" });
      return { success: true, data: status };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to check stream status: ${errMsg}`,
          action: "CHECK_RETAKE_STATUS",
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Am I live on retake?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Checking retake.tv stream status...",
          action: "CHECK_RETAKE_STATUS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "How many viewers do I have?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me check the retake.tv stream status and viewer count.",
          action: "CHECK_RETAKE_STATUS",
        },
      },
    ],
  ],
};
