/**
 * Action: STOP_STREAM_PIPELINE
 *
 * Stops the Xvfb + Chromium + FFmpeg video pipeline and tells retake.tv
 * the stream is offline.
 *
 * Steps:
 *   1. Stop StreamPipeline (kills FFmpeg, Chromium, Xvfb)
 *   2. Call retakeClient.stopStream() → tell retake.tv we're offline
 *   3. Return stream stats (duration, viewers)
 */

import { getRetakeClient } from "../../retake-client.js";
import { getStreamPipeline } from "../../stream-pipeline.js";
import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "../../types.js";

export const stopPipelineAction: Action = {
  name: "STOP_STREAM_PIPELINE",
  similes: [
    "STOP_VIDEO_PIPELINE",
    "STOP_STREAMING_PIPELINE",
    "KILL_STREAM_PIPELINE",
  ],
  description:
    "Stop the video capture pipeline (Xvfb + Chromium + FFmpeg) and end the retake.tv stream.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    const client = getRetakeClient();
    if (!client || !client.hasToken) return false;

    // Only show if pipeline is actually running
    const pipeline = getStreamPipeline();
    return pipeline !== null && pipeline.isRunning();
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
      const text = "retake.tv is not configured or agent is not registered.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    const pipeline = getStreamPipeline();
    if (!pipeline || !pipeline.isRunning()) {
      const text = "Stream pipeline is not running.";
      if (callback) await callback({ text, action: "STOP_STREAM_PIPELINE" });
      return { success: false, error: text };
    }

    try {
      // 1. Stop local pipeline (FFmpeg → Chromium → Xvfb)
      const { uptime: pipelineUptime } = await pipeline.stop();

      // 2. Tell retake.tv we're offline
      const result = await client.stopStream();

      const text =
        `Stream pipeline stopped after ${Math.floor(result.duration_seconds / 60)}m ` +
        `${result.duration_seconds % 60}s with ${result.viewers} viewer${result.viewers === 1 ? "" : "s"}. ` +
        `Pipeline uptime: ${pipelineUptime}s.`;
      if (callback) await callback({ text, action: "STOP_STREAM_PIPELINE" });
      return { success: true, data: { ...result, pipelineUptime } };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Even if the API call fails, try to kill local processes
      if (pipeline.isRunning()) {
        await pipeline.stop().catch(() => {});
      }

      if (callback) {
        await callback({
          text: `Failed to stop stream pipeline cleanly: ${errMsg}`,
          action: "STOP_STREAM_PIPELINE",
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Stop the streaming pipeline." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Stopping the video capture pipeline and ending the retake.tv stream...",
          action: "STOP_STREAM_PIPELINE",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Kill the video pipeline and go offline." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Shutting down FFmpeg, Chromium, and Xvfb. Going offline on retake.tv.",
          action: "STOP_STREAM_PIPELINE",
        },
      },
    ],
  ],
};
