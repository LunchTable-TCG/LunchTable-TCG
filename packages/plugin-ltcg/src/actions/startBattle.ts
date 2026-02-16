/**
 * Action: START_LTCG_BATTLE
 *
 * Starts a story mode battle, picks the first available chapter, and begins
 * the match using the currently selected active deck.
 */

import { getClient } from "../client.js";
import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "../types.js";

export const startBattleAction: Action = {
  name: "START_LTCG_BATTLE",
  similes: ["PLAY_LTCG", "START_MATCH", "FIGHT_BATTLE", "PLAY_CARD_GAME"],
  description:
    "Start a LunchTable Trading Card Game story battle against the AI opponent. Only available when no match is active.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    try {
      return !getClient().hasActiveMatch;
    } catch {
      return false;
    }
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const client = getClient();

    try {
      const me = await client.getMe();

      const meBag = me as unknown as Record<string, unknown>;
      const activeDeckCode = (() => {
        if (typeof meBag.activeDeckCode === "string" && meBag.activeDeckCode.trim()) {
          return meBag.activeDeckCode.trim();
        }
        if (
          typeof meBag.activeDeck === "object" &&
          meBag.activeDeck !== null &&
          typeof (meBag.activeDeck as { deckCode?: unknown }).deckCode === "string"
        ) {
          const value = (meBag.activeDeck as { deckCode?: unknown }).deckCode;
          if (typeof value === "string" && value.trim()) return value.trim();
        }
        return null;
      })();
      const hasActiveDeckHint = "activeDeckCode" in meBag || "activeDeck" in meBag;
      if (hasActiveDeckHint && !activeDeckCode) {
        throw new Error("No active deck selected. Set your active deck before starting a battle.");
      }

      // Get first available chapter
      const chapters = (await client.getChapters()) ?? [];
      if (!Array.isArray(chapters) || !chapters.length) {
        throw new Error("No story chapters available. Run seed first.");
      }
      const chapter = chapters[0];

      // Start the battle
      const result = await client.startBattle(chapter._id, 1);
      client.setMatch(result.matchId);

      const text = `Battle started! Chapter "${chapter.title ?? chapter.name}" as ${me.name}. Match: ${result.matchId}`;
      if (callback) await callback({ text, action: "START_LTCG_BATTLE" });
      return { success: true, data: { matchId: result.matchId } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const normalized = msg.toLowerCase();
      const isDeckMissingError =
        normalized.includes("deck") &&
        (normalized.includes("active") ||
          normalized.includes("missing") ||
          normalized.includes("select"));
      const text = isDeckMissingError
        ? "No active deck selected. Please choose a starter deck before starting the battle."
        : `Failed to start battle: ${msg}`;
      if (callback) await callback({ text });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Play a card game" } },
      {
        name: "{{agent}}",
        content: {
          text: "Starting a LunchTable battle!",
          action: "START_LTCG_BATTLE",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Start a story battle for me" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me start a story mode battle!",
          action: "START_LTCG_BATTLE",
        },
      },
    ],
  ],
};
