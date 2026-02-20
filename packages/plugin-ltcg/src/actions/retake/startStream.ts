/**
 * Action: START_RETAKE_STREAM
 *
 * Starts a live stream session on retake.tv.
 * If the video pipeline is available and dependencies are installed,
 * also starts Xvfb + Chromium + FFmpeg to capture game visuals.
 * Otherwise falls back to API-only mode (agent pushes video externally).
 */

import { getRetakeClient } from "../../retake-client.js";
import { getStreamPipeline, initStreamPipeline } from "../../stream-pipeline.js";
import { checkStreamDependencies } from "../../stream-deps.js";
import { getEnvValue } from "../../env.js";
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
    "Start a live stream session on retake.tv. Requires prior registration. " +
    "Auto-starts video pipeline if Xvfb + FFmpeg are available.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    const client = getRetakeClient();
    return client !== null && client.hasToken;
  },

  handler: async (
    runtime: IAgentRuntime,
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

      let pipelineStarted = false;

      // Try to auto-start video pipeline if deps are available
      const deps = await checkStreamDependencies();
      if (deps.allReady) {
        const gameUrl =
          (runtime.getSetting?.("RETAKE_GAME_URL") as string | undefined) ||
          getEnvValue("RETAKE_GAME_URL") ||
          getEnvValue("LTCG_WEB_URL") ||
          "";
        const authToken =
          (runtime.getSetting?.("LTCG_API_KEY") as string | undefined) ||
          getEnvValue("LTCG_API_KEY") ||
          "";

        if (gameUrl) {
          const existing = getStreamPipeline();
          if (!existing?.isRunning()) {
            try {
              const creds = await client.getRtmpCredentials();
              const pipeline = initStreamPipeline();
              await pipeline.start({
                gameUrl,
                authToken,
                rtmpUrl: creds.url,
                rtmpKey: creds.key,
              });
              pipelineStarted = true;
            } catch (pipeErr) {
              console.warn(
                `[LTCG] Video pipeline failed to start: ${pipeErr instanceof Error ? pipeErr.message : pipeErr}`,
              );
            }
          }
        }
      }

      const tokenInfo = result.token?.tokenAddress
        ? ` Token: ${result.token.ticker} (${result.token.tokenAddress})`
        : "";
      const pipelineInfo = pipelineStarted
        ? " Video pipeline active."
        : deps.allReady
          ? ""
          : " (API-only — video pipeline unavailable)";
      const text = `Stream started on retake.tv.${tokenInfo}${pipelineInfo}`;
      if (callback) await callback({ text, action: "START_RETAKE_STREAM" });
      return { success: true, data: result, pipelineStarted };
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
