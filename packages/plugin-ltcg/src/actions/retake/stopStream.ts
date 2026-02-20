/**
 * Action: STOP_RETAKE_STREAM
 *
 * Stops the current live stream session on retake.tv.
 * If the video pipeline is running, also stops Xvfb + Chromium + FFmpeg.
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

export const stopRetakeStreamAction: Action = {
  name: "STOP_RETAKE_STREAM",
  similes: ["STOP_STREAM", "END_STREAM", "GO_OFFLINE"],
  description:
    "Stop the current live stream session on retake.tv. Also stops video pipeline if running.",

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
      // Stop video pipeline if running
      let pipelineStopped = false;
      const pipeline = getStreamPipeline();
      if (pipeline?.isRunning()) {
        await pipeline.stop().catch((err) => {
          console.warn(
            `[LTCG] Pipeline stop warning: ${err instanceof Error ? err.message : err}`,
          );
        });
        pipelineStopped = true;
      }

      const result = await client.stopStream();

      const pipelineInfo = pipelineStopped ? " Video pipeline stopped." : "";
      const text = `Stream stopped after ${Math.floor(result.duration_seconds / 60)}m ${result.duration_seconds % 60}s with ${result.viewers} viewer${result.viewers === 1 ? "" : "s"}.${pipelineInfo}`;
      if (callback) await callback({ text, action: "STOP_RETAKE_STREAM" });
      return { success: true, data: result, pipelineStopped };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Even if API call fails, try to stop local pipeline
      const pipeline = getStreamPipeline();
      if (pipeline?.isRunning()) {
        await pipeline.stop().catch(() => {});
      }

      if (callback) {
        await callback({
          text: `Failed to stop stream: ${errMsg}`,
          action: "STOP_RETAKE_STREAM",
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Stop streaming." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Stopping the retake.tv stream...",
          action: "STOP_RETAKE_STREAM",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Go offline on retake." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Ending the live stream on retake.tv.",
          action: "STOP_RETAKE_STREAM",
        },
      },
    ],
  ],
};
