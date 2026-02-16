/**
 * Action: PLAY_LTCG_TURN
 *
 * Auto-plays one full turn: summon, spells, combat, end turn.
 * Uses shared turn logic from turnLogic.ts.
 */

import { getClient } from "../client.js";
import { playOneTurn, gameOverSummary } from "./turnLogic.js";
import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "../types.js";

export const playTurnAction: Action = {
  name: "PLAY_LTCG_TURN",
  similes: ["TAKE_TURN", "PLAY_CARDS", "MAKE_MOVE"],
  description:
    "Play a full turn in the active LunchTable match — summon monsters, activate spells, attack, and end turn. Requires an active match.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    try {
      return getClient().hasActiveMatch;
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
    const matchId = client.currentMatchId;

    if (!matchId) {
      const text = "No active match. Use START_LTCG_BATTLE first.";
      if (callback) await callback({ text });
      return { success: false, error: "No active match" };
    }

    try {
      let view = await client.getView(matchId, "host");

      if (view.gameOver) {
        client.setMatch(null);
        const text = gameOverSummary(view);
        if (callback) await callback({ text, action: "PLAY_LTCG_TURN" });
        return { success: true, data: { gameOver: true } };
      }

      if (view.currentTurnPlayer !== "host") {
        const text = "Waiting — it's the opponent's turn.";
        if (callback) await callback({ text });
        return { success: true, data: { gameOver: false } };
      }

      const actions = await playOneTurn(matchId, view);

      // Check game over after turn
      view = await client.getView(matchId, "host");
      if (view.gameOver) {
        client.setMatch(null);
        actions.push(gameOverSummary(view));
      }

      const summary = actions.length > 0 ? actions.join(". ") + "." : "No actions taken.";
      if (callback) await callback({ text: summary, action: "PLAY_LTCG_TURN" });

      return {
        success: true,
        data: {
          gameOver: view.gameOver,
          matchId: view.gameOver ? null : matchId,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) await callback({ text: `Turn failed: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Play your turn" } },
      {
        name: "{{agent}}",
        content: {
          text: "Playing my turn now!",
          action: "PLAY_LTCG_TURN",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Take your next turn in the card game" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me make my moves!",
          action: "PLAY_LTCG_TURN",
        },
      },
    ],
  ],
};
