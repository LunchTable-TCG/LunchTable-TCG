/**
 * Action: GET_RTMP_CREDENTIALS
 *
 * Fetches RTMP URL and stream key for pushing video via OBS/ffmpeg.
 */

import { getRetakeClient } from "../../retake-client.js";
import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "../../types.js";

export const getRtmpCredentialsAction: Action = {
  name: "GET_RTMP_CREDENTIALS",
  similes: ["RTMP_CREDENTIALS", "STREAM_KEY", "GET_STREAM_KEY"],
  description:
    "Get RTMP URL and stream key for pushing video to retake.tv via OBS or ffmpeg.",

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
      const creds = await client.getRtmpCredentials();

      const text = `RTMP credentials:\n  URL: ${creds.url}\n  Key: ${creds.key}`;
      if (callback) await callback({ text, action: "GET_RTMP_CREDENTIALS" });
      return { success: true, data: creds };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to get RTMP credentials: ${errMsg}`,
          action: "GET_RTMP_CREDENTIALS",
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Get my stream key for OBS." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Fetching RTMP credentials from retake.tv...",
          action: "GET_RTMP_CREDENTIALS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "What's the RTMP URL for streaming?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll get the RTMP URL and stream key from retake.tv.",
          action: "GET_RTMP_CREDENTIALS",
        },
      },
    ],
  ],
};
