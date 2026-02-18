/**
 * Action: GET_LTCG_SOUNDTRACK
 *
 * Fetches the platform soundtrack catalog so agents can stream the same
 * music catalog used by human players.
 */

import { getClient } from "../client.js";
import { getEnvValue } from "../env.js";
import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "../types.js";

type SoundtrackPayload = {
  source?: string;
  playlists?: Record<string, string[]>;
  sfx?: Record<string, string>;
  resolved?: {
    context?: string;
    key?: string | null;
    tracks?: string[];
    shuffle?: boolean;
  };
};

function getSoundtrackEndpoint(runtime: IAgentRuntime): string {
  return (
    runtime.getSetting("LTCG_SOUNDTRACK_API_URL") ||
    getEnvValue("LTCG_SOUNDTRACK_API_URL") ||
    ""
  );
}

function inferContext(text: string, hasActiveMatch: boolean): string {
  const lowered = text.toLowerCase();
  if (/\blanding|home\b/.test(lowered)) return "landing";
  if (/\bstory|chapter\b/.test(lowered)) return "story";
  if (/\bwatch|stream\b/.test(lowered)) return "watch";
  if (/\bdeck|collection|clique|leaderboard\b/.test(lowered)) return "default";
  if (/\bplay|battle|match|combat\b/.test(lowered)) return "play";
  return hasActiveMatch ? "play" : "landing";
}

function describeTracks(tracks: string[]): string {
  if (tracks.length === 0) return "No tracks found for that context.";
  const preview = tracks.slice(0, 5).join("\n- ");
  const suffix = tracks.length > 5 ? `\n(+${tracks.length - 5} more)` : "";
  return `Tracks (${tracks.length}):\n- ${preview}${suffix}`;
}

export const getSoundtrackAction: Action = {
  name: "GET_LTCG_SOUNDTRACK",
  similes: ["LTCG_SOUNDTRACK", "LTCG_MUSIC", "GET_GAME_AUDIO"],
  description:
    "Fetch the LunchTable soundtrack catalog (playlist + SFX URLs) for agent streaming and playback.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    try {
      getClient();
      return true;
    } catch {
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const endpoint = getSoundtrackEndpoint(runtime);
    if (!endpoint) {
      const text =
        "Soundtrack endpoint is not configured. Set LTCG_SOUNDTRACK_API_URL (example: https://your-app.com/api/soundtrack).";
      if (callback) await callback({ text });
      return { success: false, error: text };
    }

    const client = getClient();
    const messageText = message.content?.text ?? "";
    const context = inferContext(messageText, client.hasActiveMatch);

    try {
      const url = new URL(endpoint);
      url.searchParams.set("context", context);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Soundtrack fetch failed (${response.status})`);
      }

      const payload = (await response.json()) as SoundtrackPayload;
      const tracks = Array.isArray(payload.resolved?.tracks)
        ? payload.resolved?.tracks ?? []
        : [];
      const sfxKeys = payload.sfx ? Object.keys(payload.sfx) : [];

      const text = [
        `Soundtrack context: ${payload.resolved?.context ?? context}`,
        payload.source ? `Source: ${payload.source}` : null,
        describeTracks(tracks),
        `SFX keys: ${sfxKeys.length > 0 ? sfxKeys.join(", ") : "none"}`,
      ]
        .filter(Boolean)
        .join("\n");

      if (callback) await callback({ text, action: "GET_LTCG_SOUNDTRACK" });
      return {
        success: true,
        data: {
          endpoint: url.origin + url.pathname,
          context: payload.resolved?.context ?? context,
          shuffle: Boolean(payload.resolved?.shuffle),
          tracks,
          sfx: payload.sfx ?? {},
          playlists: payload.playlists ?? {},
        },
      };
    } catch (err) {
      const messageTextOut = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Unable to fetch soundtrack catalog: ${messageTextOut}`,
          action: "GET_LTCG_SOUNDTRACK",
        });
      }
      return { success: false, error: messageTextOut };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Get the play soundtrack for stream mode." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Fetching LunchTable soundtrack catalog for play context...",
          action: "GET_LTCG_SOUNDTRACK",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "What songs can I use for landing page stream?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll fetch the landing soundtrack list and SFX keys now.",
          action: "GET_LTCG_SOUNDTRACK",
        },
      },
    ],
  ],
};
