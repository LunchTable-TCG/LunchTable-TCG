import { describe, expect, it, vi } from "vitest";
import { initClient } from "../client.js";
import { playStoryAction } from "../actions/playStory.js";
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
  return { content: { text: "play story" } };
}

describe("playStoryAction", () => {
  it("uses the next-stage endpoint and treats done=true as a success", async () => {
    const client = initClient("http://example.invalid", "ltcg_test_key");

    const getNextStoryStage = vi.fn().mockResolvedValue({ done: true });
    const getStoryProgress = vi.fn(() => {
      throw new Error("getStoryProgress should not be called by PLAY_LTCG_STORY");
    });

    // Best-effort deck selection step should not block this test.
    const getStarterDecks = vi.fn().mockResolvedValue([]);
    const selectDeck = vi.fn().mockResolvedValue(undefined);

    const startBattle = vi.fn(() => {
      throw new Error("startBattle should not be called when done=true");
    });

    Object.assign(client, {
      getNextStoryStage,
      getStoryProgress,
      getStarterDecks,
      selectDeck,
      startBattle,
    });

    const callback = vi.fn().mockResolvedValue([]);

    const result = (await playStoryAction.handler(
      createRuntime(),
      createMessage(),
      undefined,
      undefined,
      callback,
    )) as unknown as { success: boolean; data?: unknown };

    expect(getNextStoryStage).toHaveBeenCalledTimes(1);
    expect(getStoryProgress).toHaveBeenCalledTimes(0);
    expect(result).toEqual({ success: true, data: { done: true } });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

