import { describe, expect, it, vi } from "vitest";
import { initClient } from "../client.js";
import { startBattleAction } from "../actions/startBattle.js";
import type { IAgentRuntime, Memory } from "../types.js";

function createRuntime(): IAgentRuntime {
  return {
    agentId: "agent_test",
    getSetting: () => undefined,
    getService: () => null,
    registerEvent: () => {},
    emitEvent: async () => {},
  };
}

function createMessage(): Memory {
  return { content: { text: "start battle" } };
}

describe("startBattleAction", () => {
  it("does not override an already-selected active deck", async () => {
    const client = initClient("http://example.invalid", "ltcg_test_key");

    const getMe = vi.fn().mockResolvedValue({
      id: "me",
      name: "Agent",
      activeDeckCode: "DECK_1",
    });
    const getStarterDecks = vi.fn().mockResolvedValue([
      { deckCode: "DECK_2", name: "Starter" },
    ]);
    const selectDeck = vi.fn().mockResolvedValue(undefined);

    const getChapters = vi.fn().mockResolvedValue([
      { _id: "chapter_1", title: "Chapter 1" },
    ]);
    const startBattle = vi.fn().mockResolvedValue({ matchId: "match_1" });
    const setMatchWithSeat = vi.fn().mockResolvedValue(undefined);

    Object.assign(client, {
      getMe,
      getStarterDecks,
      selectDeck,
      getChapters,
      startBattle,
      setMatchWithSeat,
    });

    const callback = vi.fn().mockResolvedValue([]);

    const result = (await startBattleAction.handler(
      createRuntime(),
      createMessage(),
      undefined,
      undefined,
      callback,
    )) as unknown as { success: boolean; data?: unknown };

    expect(getMe).toHaveBeenCalledTimes(1);
    expect(getStarterDecks).toHaveBeenCalledTimes(0);
    expect(selectDeck).toHaveBeenCalledTimes(0);

    expect(getChapters).toHaveBeenCalledTimes(1);
    expect(startBattle).toHaveBeenCalledWith("chapter_1", 1);
    expect(setMatchWithSeat).toHaveBeenCalledWith("match_1");
    expect(result).toEqual({ success: true, data: { matchId: "match_1" } });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("auto-selects a starter deck when no active deck is detected", async () => {
    const client = initClient("http://example.invalid", "ltcg_test_key");

    const getMe = vi.fn().mockResolvedValue({
      id: "me",
      name: "Agent",
      activeDeckCode: "   ",
    });
    const getStarterDecks = vi.fn().mockResolvedValue([
      { deckCode: "DECK_2", name: "Starter" },
    ]);
    const selectDeck = vi.fn().mockResolvedValue(undefined);

    const getChapters = vi.fn().mockResolvedValue([
      { _id: "chapter_1", title: "Chapter 1" },
    ]);
    const startBattle = vi.fn().mockResolvedValue({ matchId: "match_1" });
    const setMatchWithSeat = vi.fn().mockResolvedValue(undefined);

    Object.assign(client, {
      getMe,
      getStarterDecks,
      selectDeck,
      getChapters,
      startBattle,
      setMatchWithSeat,
    });

    const result = (await startBattleAction.handler(
      createRuntime(),
      createMessage(),
    )) as unknown as { success: boolean };

    expect(getStarterDecks).toHaveBeenCalledTimes(1);
    expect(selectDeck).toHaveBeenCalledWith("DECK_2");
    expect(result.success).toBe(true);
  });
});

