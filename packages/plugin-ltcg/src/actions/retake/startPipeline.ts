/**
 * Action: START_STREAM_PIPELINE
 *
 * Combines retake.tv API flow with local Xvfb + Chromium + FFmpeg video pipeline.
 *
 * Steps:
 *   1. Verify retake client is registered
 *   2. Call retakeClient.startStream() → tell retake.tv we're going live
 *   3. Call retakeClient.getRtmpCredentials() → get RTMP URL + key
 *   4. Start StreamPipeline with RTMP creds + game spectator URL
 *   5. Return success with stream info
 *
 * Requires Linux with Xvfb, Chromium, and FFmpeg installed.
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

export const startPipelineAction: Action = {
  name: "START_STREAM_PIPELINE",
  similes: [
    "START_VIDEO_PIPELINE",
    "START_STREAMING_PIPELINE",
    "GO_LIVE_WITH_VIDEO",
  ],
  description:
    "Start the full streaming pipeline: tell retake.tv we're live, capture game visuals via Xvfb + Chromium, and push RTMP video via FFmpeg. Requires Linux.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    const client = getRetakeClient();
    if (!client || !client.hasToken) return false;

    // Only show this action if streaming deps are available
    const deps = await checkStreamDependencies();
    return deps.allReady;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    // 1. Check retake client
    const client = getRetakeClient();
    if (!client || !client.hasToken) {
      const text =
        "retake.tv is not configured or agent is not registered. Use REGISTER_RETAKE_STREAM first.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    // 2. Check if pipeline is already running
    const existing = getStreamPipeline();
    if (existing?.isRunning()) {
      const text = "Stream pipeline is already running.";
      if (callback) await callback({ text, action: "START_STREAM_PIPELINE" });
      return { success: true, data: { alreadyRunning: true } };
    }

    // 3. Resolve game URL
    const gameUrl =
      (runtime.getSetting?.("RETAKE_GAME_URL") as string | undefined) ||
      getEnvValue("RETAKE_GAME_URL") ||
      getEnvValue("LTCG_WEB_URL") ||
      "";

    if (!gameUrl) {
      const text =
        "RETAKE_GAME_URL is not configured. Set it to the game frontend URL (e.g. http://localhost:3334).";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    const authToken =
      (runtime.getSetting?.("LTCG_API_KEY") as string | undefined) ||
      getEnvValue("LTCG_API_KEY") ||
      "";

    try {
      // 4. Tell retake.tv we're going live
      if (callback) {
        await callback({
          text: "Starting stream on retake.tv...",
          action: "START_STREAM_PIPELINE",
        });
      }
      const streamResult = await client.startStream();

      // 5. Get RTMP credentials
      const creds = await client.getRtmpCredentials();

      // 6. Start local pipeline — target the stream overlay page (no recursive iframe)
      const overlayUrl = `${gameUrl.replace(/\/$/, "")}/stream-overlay?apiKey=${encodeURIComponent(authToken)}&embedded=true`;
      const pipeline = initStreamPipeline();
      await pipeline.start({
        gameUrl: overlayUrl,
        authToken,
        rtmpUrl: creds.url,
        rtmpKey: creds.key,
      });

      const tokenInfo = streamResult.token?.tokenAddress
        ? ` Token: ${streamResult.token.ticker} (${streamResult.token.tokenAddress})`
        : "";
      const text = `Stream pipeline running. Video capture → RTMP → retake.tv.${tokenInfo}`;
      if (callback) await callback({ text, action: "START_STREAM_PIPELINE" });
      return { success: true, data: { stream: streamResult, rtmp: creds } };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // If pipeline started but something else failed, try to clean up
      const pipeline = getStreamPipeline();
      if (pipeline?.isRunning()) {
        await pipeline.stop().catch(() => {});
      }

      if (callback) {
        await callback({
          text: `Failed to start stream pipeline: ${errMsg}`,
          action: "START_STREAM_PIPELINE",
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Start the full streaming pipeline with video capture." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Starting Xvfb + Chromium + FFmpeg pipeline and going live on retake.tv...",
          action: "START_STREAM_PIPELINE",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Go live with the video pipeline." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Launching the streaming pipeline to capture game visuals and push to retake.tv.",
          action: "START_STREAM_PIPELINE",
        },
      },
    ],
  ],
};
