/**
 * Action: REGISTER_RETAKE_STREAM
 *
 * Registers the agent on retake.tv and stores the returned access token
 * for subsequent streaming API calls.
 */

import { getRetakeClient } from "../../retake-client.js";
import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "../../types.js";

export const registerStreamAction: Action = {
  name: "REGISTER_RETAKE_STREAM",
  similes: ["RETAKE_REGISTER", "REGISTER_STREAM", "SETUP_STREAM"],
  description:
    "Register this agent on retake.tv to enable live streaming. Only needed once — stores the access token for future calls.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    const client = getRetakeClient();
    // Only show this action if retake is configured but not yet registered
    return client !== null && !client.hasToken;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const client = getRetakeClient();
    if (!client) {
      const text = "retake.tv client is not configured. Set RETAKE_API_URL.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    if (client.hasToken) {
      const text = "Already registered on retake.tv — token is set.";
      if (callback) await callback({ text });
      return { success: true, data: { alreadyRegistered: true } };
    }

    const agentName =
      runtime.getSetting("RETAKE_AGENT_NAME") || "lunchtable-agent";
    const agentDescription =
      runtime.getSetting("RETAKE_AGENT_DESCRIPTION") ||
      "LunchTable TCG AI agent";
    const imageUrl = runtime.getSetting("RETAKE_AGENT_IMAGE") || "";
    const walletAddress = runtime.getSetting("RETAKE_WALLET_ADDRESS") || "";
    const ticker = runtime.getSetting("RETAKE_AGENT_TICKER") || "LTCG";

    if (!imageUrl) {
      const text =
        "RETAKE_AGENT_IMAGE is required for registration (square 1:1 image URL). Set it in agent config.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }
    if (!walletAddress) {
      const text =
        "RETAKE_WALLET_ADDRESS is required for registration (Solana wallet address). Set it in agent config.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    try {
      const agent = await client.register({
        agent_name: agentName,
        agent_description: agentDescription,
        image_url: imageUrl,
        wallet_address: walletAddress,
        ticker,
      });

      const text = `Registered on retake.tv as "${agent.agent_name}" (agent_id: ${agent.agent_id}). Streaming is now available.`;
      if (callback) await callback({ text, action: "REGISTER_RETAKE_STREAM" });
      return {
        success: true,
        data: {
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
        },
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to register on retake.tv: ${errMsg}`,
          action: "REGISTER_RETAKE_STREAM",
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Register on retake.tv so you can stream." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Registering agent on retake.tv for live streaming...",
          action: "REGISTER_RETAKE_STREAM",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Set up streaming for the agent." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll register on retake.tv to enable streaming capabilities.",
          action: "REGISTER_RETAKE_STREAM",
        },
      },
    ],
  ],
};
