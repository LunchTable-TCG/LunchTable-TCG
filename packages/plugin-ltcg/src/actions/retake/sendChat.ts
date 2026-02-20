/**
 * Action: SEND_RETAKE_CHAT
 *
 * Sends a chat message to a retake.tv stream room.
 * The agent can chat in its own stream or in another streamer's room.
 */

import { getRetakeClient } from "../../retake-client.js";
import { getClient } from "../../client.js";
import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "../../types.js";

/** Extract a userDbId (UUID format) from message text. */
function extractUserDbId(text: string): string | null {
  const uuidMatch = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  return uuidMatch ? uuidMatch[0] : null;
}

export const sendChatAction: Action = {
  name: "SEND_RETAKE_CHAT",
  similes: ["RETAKE_CHAT", "STREAM_CHAT", "SEND_STREAM_MESSAGE"],
  description:
    "Send a chat message to a retake.tv stream. Provide the message text and optionally a destination streamer's userDbId (defaults to own stream).",

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
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const client = getRetakeClient();
    if (!client || !client.hasToken) {
      const text =
        "retake.tv is not configured or agent is not registered.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    const messageText = message.content?.text ?? "";

    // Destination can come from options or be extracted from message text
    const destinationUserId =
      (typeof options?.destinationUserId === "string"
        ? options.destinationUserId
        : null) ||
      extractUserDbId(messageText) ||
      runtime.getSetting("RETAKE_OWN_USER_DB_ID") ||
      "";

    if (!destinationUserId) {
      const text =
        "No destination streamer ID provided. Include a userDbId (UUID) in the message or set RETAKE_OWN_USER_DB_ID.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    // Extract chat content — strip UUID if present, require remaining text
    const strippedMessage = messageText
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
        "",
      )
      .trim();

    // If the message was only a UUID (or empty), we have nothing to send
    const chatMessage =
      typeof options?.message === "string" && options.message.length > 0
        ? options.message
        : strippedMessage;

    if (!chatMessage) {
      const text =
        "No chat message provided. Include the message text or pass it via options.message.";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    try {
      const result = await client.sendChat(chatMessage, destinationUserId);

      // Also push to Convex stream overlay so viewers see it
      try {
        const ltcgClient = getClient();
        await ltcgClient.postStreamChat(chatMessage, {
          role: "agent",
          source: "retake",
        });
      } catch {
        // Best-effort: don't fail the retake send if Convex push fails
      }

      const text = `Chat sent (${result.message_id}) at ${result.sent_at}.`;
      if (callback) await callback({ text, action: "SEND_RETAKE_CHAT" });
      return { success: true, data: result };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to send chat: ${errMsg}`,
          action: "SEND_RETAKE_CHAT",
        });
      }
      return { success: false, error: errMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Say 'gg well played' in the stream chat." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Sending chat message to the stream...",
          action: "SEND_RETAKE_CHAT",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Chat in the retake stream: starting a new LTCG match!",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Posting to retake.tv stream chat now.",
          action: "SEND_RETAKE_CHAT",
        },
      },
    ],
  ],
};
