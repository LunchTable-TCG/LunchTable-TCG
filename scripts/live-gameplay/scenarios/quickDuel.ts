import type { LtcgAgentApiClient } from "../agentApi";
import type { CardLookup } from "../cardLookup";
import { appendTimeline } from "../report";
import { choosePhaseCommand, signature, stripCommandLog, type PlayerView } from "../strategy";

const MAX_STEPS = 1000;
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
  let stagnant = 0;

  const attemptFallback = async (opts: {
    seat: string;
    baseSignature: string;
    fallbackType: "ADVANCE_PHASE" | "END_TURN";
  }) => {
    const fallbackCommand = { type: opts.fallbackType } as const;
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
    if (!view || view.gameOver) return;
    if (!view.mySeat || view.currentTurnPlayer !== view.mySeat) return;

    const selected = choosePhaseCommand(view, args.cardLookup) as Record<string, unknown> & { _log?: string };
    const command = stripCommandLog(selected);

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
        message: `action_failed err=${String(error?.message ?? error)}`,
      });
      try {
        await args.client.submitAction({
          matchId: args.matchId,
          command: { type: "END_TURN" },
          seat: view.mySeat,
        });
      } catch {
        return;
      }
    }

    const next = (await args.client.getView({ matchId: args.matchId })) as PlayerView | null;
    if (!next || next.gameOver) return;
    if (next.currentTurnPlayer !== next.mySeat) return;
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

      if (!progressed && stagnant >= 2) return;
      continue;
    }

    stagnant = 0;
  }
}

export async function runQuickDuelScenario(args: {
  client: LtcgAgentApiClient;
  cardLookup: CardLookup;
  timelinePath: string;
  maxDurationMs?: number;
}): Promise<{ matchId: string; finalStatus: any }> {
  const start = await args.client.startDuel();
  const matchId = String((start as any).matchId ?? "");
  if (!matchId) throw new Error("Duel start returned no matchId.");

  await appendTimeline(args.timelinePath, {
    type: "match",
    message: "duel_start",
    matchId,
  });

  let steps = 0;
  let lastSig = "";
  let staleTicks = 0;
  const startedAtMs = Date.now();
  const maxDurationMs =
    Number.isFinite(args.maxDurationMs) && Number(args.maxDurationMs) > 0
      ? Number(args.maxDurationMs)
      : 60000;

  while (steps < MAX_STEPS) {
    if (Date.now() - startedAtMs > maxDurationMs) {
      throw new Error(`quick duel timed out after ${maxDurationMs}ms`);
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
    if (sig === lastSig) {
      await sleep(TICK_SLEEP_MS);
    }
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
      throw new Error(`quick duel stalled waiting for opponent turn (${staleTicks} ticks)`);
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
      await performAgentTurn({
        client: args.client,
        matchId,
        cardLookup: args.cardLookup,
        timelinePath: args.timelinePath,
      });
    } else {
      await sleep(TICK_SLEEP_MS);
    }

    steps += 1;
    await sleep(60);
  }

  const finalStatus = await args.client.getMatchStatus(matchId);
  return { matchId, finalStatus };
}
