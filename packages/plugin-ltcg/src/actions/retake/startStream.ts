/**
 * Action: START_RETAKE_STREAM
 *
 * Starts a live stream session on retake.tv.
 */

import { getRetakeClient } from "../../retake-client.js";
import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "../../types.js";

export const startRetakeStreamAction: Action = {
  name: "START_RETAKE_STREAM",
  similes: ["START_STREAM", "GO_LIVE", "BEGIN_STREAM"],
  description:
    "Start a live stream session on retake.tv. Requires prior registration.",

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
        "retake.tv is not configured or agent is not registered. Use REGISTER_RETAKE_STREAM first.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    try {
      const result = await client.startStream();

      const text = result.token?.tokenAddress
        ? `Stream started on retake.tv. Token: ${result.token.ticker} (${result.token.tokenAddress})`
        : "Stream started on retake.tv.";
      if (callback) await callback({ text, action: "START_RETAKE_STREAM" });
      return { success: true, data: result };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to start stream: ${errMsg}`,
          action: "START_RETAKE_STREAM",
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Go live on retake.tv." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Starting live stream on retake.tv...",
          action: "START_RETAKE_STREAM",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Start streaming the game." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Going live on retake.tv now.",
          action: "START_RETAKE_STREAM",
        },
      },
    ],
  ],
};
