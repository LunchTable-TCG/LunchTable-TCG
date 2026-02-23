import type { LtcgAgentApiClient } from "../agentApi";
import type { CardLookup } from "../cardLookup";
import { appendTimeline } from "../report";
import { choosePhaseCommand, signature, stripCommandLog, type PlayerView } from "../strategy";
import type { LiveGameplayAssertion } from "../types";

const MAX_STEPS = 1200;
const MAX_PHASE_COMMANDS = 25;
const TICK_SLEEP_MS = 180;
const STALE_GLOBAL_LIMIT = 40;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function performAgentTurn(args: {
  client: LtcgAgentApiClient;
  matchId: string;
  cardLookup: CardLookup;
  timelinePath: string;
}) {
  const actions: string[] = [];
  let stagnant = 0;

  const attemptFallback = async (opts: {
    seat: string;
    baseSignature: string;
    fallbackType: "ADVANCE_PHASE" | "END_TURN";
  }) => {
    const fallbackCommand = { type: opts.fallbackType } as const;
    actions.push(`fallback ${opts.fallbackType.toLowerCase()}`);
    await appendTimeline(args.timelinePath, {
      type: "action",
      matchId: args.matchId,
      seat: opts.seat,
      command: fallbackCommand,
    });

    try {
      await args.client.submitAction({
        matchId: args.matchId,
        command: fallbackCommand,
        seat: opts.seat,
      });
    } catch (error: any) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `fallback_failed type=${opts.fallbackType} err=${String(error?.message ?? error)}`,
      });
      return false;
    }

    const afterFallback = (await args.client.getView({ matchId: args.matchId })) as PlayerView | null;
    if (!afterFallback || afterFallback.gameOver) return true;
    if (!afterFallback.mySeat || afterFallback.currentTurnPlayer !== afterFallback.mySeat) return true;
    return signature(afterFallback) !== opts.baseSignature;
  };

  for (let step = 0; step < MAX_PHASE_COMMANDS; step += 1) {
    const view = (await args.client.getView({ matchId: args.matchId })) as PlayerView | null;
    if (!view || view.gameOver) break;
    if (!view.mySeat || view.currentTurnPlayer !== view.mySeat) break;

    const selected = choosePhaseCommand(view, args.cardLookup) as Record<string, unknown> & { _log?: string };
    const command = stripCommandLog(selected);
    const label = selected._log ?? String(selected.type ?? "command");
    actions.push(label);

    await appendTimeline(args.timelinePath, {
      type: "action",
      matchId: args.matchId,
      seat: view.mySeat,
      command,
    });

    try {
      await args.client.submitAction({ matchId: args.matchId, command, seat: view.mySeat });
    } catch (error: any) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `action_failed label=${label} err=${String(error?.message ?? error)}`,
      });

      if (selected.type !== "END_TURN") {
        try {
          await args.client.submitAction({
            matchId: args.matchId,
            command: { type: "END_TURN" },
            seat: view.mySeat,
          });
          actions.push("fallback end turn");
        } catch {
          break;
        }
      } else {
        break;
      }
    }

    const next = (await args.client.getView({ matchId: args.matchId })) as PlayerView | null;
    if (!next || next.gameOver) break;
    if (next.currentTurnPlayer !== next.mySeat) break;

    if (signature(next) === signature(view)) {
      stagnant += 1;
      const selectedType = String(selected.type ?? "unknown");
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `no_progress selected=${selectedType} stagnant=${stagnant}`,
      });

      let progressed = false;
      if (selectedType !== "END_TURN") {
        const fallbackOrder: Array<"ADVANCE_PHASE" | "END_TURN"> =
          selectedType === "ADVANCE_PHASE" ? ["END_TURN"] : ["ADVANCE_PHASE", "END_TURN"];
        for (const fallbackType of fallbackOrder) {
          if (
            await attemptFallback({
              seat: view.mySeat,
              baseSignature: signature(next),
              fallbackType,
            })
          ) {
            progressed = true;
            break;
          }
        }
      }

      if (progressed) {
        stagnant = 0;
        continue;
      }

      if (stagnant >= 2) break;
    } else {
      stagnant = 0;
    }
  }

  return actions;
}

export async function runStoryStageScenario(args: {
  client: LtcgAgentApiClient;
  cardLookup: CardLookup;
  timelinePath: string;
  chapterId?: string;
  stageNumber?: number;
  maxDurationMs?: number;
}): Promise<{ matchId: string; completion: any; assertions: LiveGameplayAssertion[] }> {
  const assertions: LiveGameplayAssertion[] = [];
  const chapters = await args.client.getChapters();
  if (!chapters?.length) throw new Error("No chapters available.");

  const chapter = args.chapterId
    ? chapters.find((c: any) => c?._id === args.chapterId) ?? null
    : chapters[0];
  if (!chapter?._id) throw new Error("Invalid chapter selection.");

  const stageNumber = typeof args.stageNumber === "number" ? args.stageNumber : 1;
  const start = await args.client.startStory({ chapterId: String(chapter._id), stageNumber });
  const matchId = String((start as any).matchId ?? "");
  if (!matchId) throw new Error("Story start returned no matchId.");

  await appendTimeline(args.timelinePath, {
    type: "match",
    message: `story_start chapter=${String(chapter._id)} stage=${stageNumber}`,
    matchId,
  });

  const initialStatus = await args.client.getMatchStatus(matchId);
  const storyMode = initialStatus.mode === "story";
  const cpuOpponent =
    initialStatus.awayId === "cpu" || initialStatus.hostId === "cpu";
  assertions.push({
    id: "story_mode_is_story",
    ok: storyMode,
    details: `mode=${String(initialStatus.mode)}`,
  });
  assertions.push({
    id: "story_mode_cpu_opponent",
    ok: cpuOpponent,
    details: `hostId=${String(initialStatus.hostId)} awayId=${String(initialStatus.awayId)}`,
  });
  if (!storyMode || !cpuOpponent) {
    throw new Error("story mode must run against built-in CPU opponent");
  }

  let steps = 0;
  let staleTicks = 0;
  let lastSig = "";
  const startedAtMs = Date.now();
  const maxDurationMs =
    Number.isFinite(args.maxDurationMs) && Number(args.maxDurationMs) > 0
      ? Number(args.maxDurationMs)
      : 60000;

  while (steps < MAX_STEPS) {
    if (Date.now() - startedAtMs > maxDurationMs) {
      throw new Error(`story stage timed out after ${maxDurationMs}ms`);
    }
    const view = (await args.client.getView({ matchId })) as PlayerView | null;
    if (!view) throw new Error("No player view returned.");

    await appendTimeline(args.timelinePath, {
      type: "view",
      matchId,
      seat: view.mySeat,
      turn: view.currentTurnPlayer,
      phase: view.currentPhase,
      priority: view.currentPriorityPlayer,
      chain: Array.isArray(view.currentChain) ? view.currentChain.length : 0,
      gameOver: Boolean(view.gameOver),
      lp: [Number(view.lifePoints ?? 0), Number(view.opponentLifePoints ?? 0)],
    });

    if (view.gameOver) break;

    const sig = signature(view);
    staleTicks = sig === lastSig ? staleTicks + 1 : 0;
    lastSig = sig;

    const hasOpenChain = Array.isArray(view.currentChain) && view.currentChain.length > 0;
    const hasChainPriority =
      hasOpenChain &&
      Boolean(view.mySeat) &&
      view.currentPriorityPlayer === view.mySeat;
    const waitingOnOpponent =
      Boolean(view.mySeat) &&
      view.currentTurnPlayer !== view.mySeat &&
      !hasOpenChain;

    if (waitingOnOpponent && staleTicks >= STALE_GLOBAL_LIMIT) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `stalled_opponent_turn ticks=${staleTicks}`,
      });
      throw new Error(`story stage stalled waiting for opponent turn (${staleTicks} ticks)`);
    }

    if (staleTicks >= STALE_GLOBAL_LIMIT) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: "stale_state forcing one action attempt",
      });
      staleTicks = 0;
    }

    if (hasChainPriority && view.mySeat) {
      const chainResponse = { type: "CHAIN_RESPONSE", pass: true } as const;
      await appendTimeline(args.timelinePath, {
        type: "action",
        matchId,
        seat: view.mySeat,
        command: chainResponse,
      });
      try {
        await args.client.submitAction({
          matchId,
          command: chainResponse,
          seat: view.mySeat,
        });
      } catch (error: any) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `chain_response_failed err=${String(error?.message ?? error)}`,
        });
      }
      steps += 1;
      await sleep(60);
      continue;
    }

    if (view.mySeat && view.currentTurnPlayer === view.mySeat) {
      const actions = await performAgentTurn({
        client: args.client,
        matchId,
        cardLookup: args.cardLookup,
        timelinePath: args.timelinePath,
      });
      if (actions.length > 0) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `turn_actions count=${actions.length} last=${actions[actions.length - 1]}`,
        });
      }
    } else {
      await sleep(TICK_SLEEP_MS);
    }

    steps += 1;
    await sleep(60);
  }

  const completion = await args.client.completeStoryStage(matchId);
  await appendTimeline(args.timelinePath, {
    type: "note",
    message: `story_complete ok`,
  });

  return { matchId, completion, assertions };
}
