import { describe, expect, it, vi } from "vitest";
import { initClient } from "../client.js";
import { LTCGAutonomyController } from "../autonomy/controller.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("LTCGAutonomyController", () => {
  it("can pause and resume deterministically mid-run", async () => {
    const controller = new LTCGAutonomyController();
    const client = initClient("http://example.invalid", "ltcg_test_key");

    const battleDeferred = deferred<{ matchId: string }>();

    Object.assign(client, {
      getMe: vi.fn().mockResolvedValue({ id: "me", name: "Agent", activeDeckCode: "DECK_1" }),
      getStarterDecks: vi.fn().mockResolvedValue([]),
      selectDeck: vi.fn().mockResolvedValue(undefined),

      getNextStoryStage: vi.fn().mockResolvedValue({
        done: false,
        chapterId: "chapter_1",
        stageNumber: 1,
      }),

      startBattle: vi.fn().mockReturnValue(battleDeferred.promise),

      setMatchWithSeat: vi.fn().mockImplementation(async (matchId: string | null) => {
        client.setMatch(matchId);
        client.setSeat("host");
      }),

      getView: vi.fn().mockResolvedValue({
        gameOver: true,
        phase: "draw",
        currentTurnPlayer: "host",
        players: { host: { lifePoints: 8000 }, away: { lifePoints: 0 } },
      }),

      completeStage: vi.fn().mockResolvedValue({ starsEarned: 3, rewards: {} }),
    });

    await controller.start({ mode: "story", continuous: false });
    expect(controller.getStatus().state).toBe("running");

    await controller.pause();
    expect(controller.getStatus().state).toBe("paused");

    // Unblock the run loop, which should then wait on the pause signal.
    battleDeferred.resolve({ matchId: "match_1" });

    await controller.resume();
    expect(controller.getStatus().state).toBe("running");

    // Wait for the background run to finish and reset the controller.
    await (controller as unknown as { runPromise: Promise<void> }).runPromise;

    expect(controller.getStatus().state).toBe("idle");
    expect(controller.getStatus().lastError).toBeNull();
  });

  it("stop() unblocks and resets to idle without setting an error", async () => {
    const controller = new LTCGAutonomyController();
    const client = initClient("http://example.invalid", "ltcg_test_key");

    const battleDeferred = deferred<{ matchId: string }>();

    Object.assign(client, {
      getMe: vi.fn().mockResolvedValue({ id: "me", name: "Agent", activeDeckCode: "DECK_1" }),
      getNextStoryStage: vi.fn().mockResolvedValue({
        done: false,
        chapterId: "chapter_1",
        stageNumber: 1,
      }),
      startBattle: vi.fn().mockReturnValue(battleDeferred.promise),
      setMatchWithSeat: vi.fn().mockResolvedValue(undefined),
      getView: vi.fn().mockResolvedValue({
        gameOver: true,
        phase: "draw",
        currentTurnPlayer: "host",
        players: { host: { lifePoints: 8000 }, away: { lifePoints: 0 } },
      }),
    });

    await controller.start({ mode: "story", continuous: true });
    expect(controller.getStatus().state).toBe("running");

    const stopPromise = controller.stop();
    battleDeferred.resolve({ matchId: "match_1" });
    await stopPromise;

    expect(controller.getStatus().state).toBe("idle");
    expect(controller.getStatus().lastError).toBeNull();
  });
});

