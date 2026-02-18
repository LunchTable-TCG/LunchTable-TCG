import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const BASE_URL = process.env.VITE_CONVEX_URL;
if (!BASE_URL) {
  console.error("Missing VITE_CONVEX_URL in env");
  process.exit(1);
}

const convex = new ConvexHttpClient(BASE_URL);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Seat = "host" | "away";
type GameEvent = {
  version?: number;
  events?: unknown;
};

type PlayerView = {
  hand?: string[];
  board?: Array<Record<string, unknown> | null>;
  opponentBoard?: Array<Record<string, unknown> | null>;
  opponentHandCount?: number;
  deckCount?: number;
  opponentDeckCount?: number;
  lifePoints?: number;
  opponentLifePoints?: number;
  currentTurnPlayer?: Seat;
  currentPhase?: string;
  currentChain?: unknown[];
  mySeat?: Seat;
  turnNumber?: number;
  gameOver?: boolean;
  winner?: Seat | null;
  winReason?: string | null;
};

type StageData = {
  stageNumber: number;
  chapterId?: string;
  title?: string;
  opponentName?: string;
  narrative?: {
    preMatchDialogue?: string[];
    postMatchWinDialogue?: string[];
    postMatchLoseDialogue?: string[];
  };
  rewardGold?: number;
  rewardXp?: number;
  firstClearBonus?: number;
};

const runId = process.env.LTCG_RUN_ID ?? `${Date.now()}`;
const MAX_STEPS = 1200;
const MAX_PHASE_COMMANDS = 20;

const STALE_TURN_LIMIT = 6;
const STALE_GLOBAL_LIMIT = 40;

async function loadCardLookup() {
  const cards = await convex.query(api.game.getAllCards, {});
  const lookup: Record<string, { name?: string; cardType?: string; type?: string; attack?: number; level?: number }> =
    {};
  for (const card of cards ?? []) {
    lookup[card._id] = card;
  }
  return lookup;
}

function cardName(cardLookup: Record<string, any>, cardId: string | undefined) {
  if (!cardId) return "card";
  return cardLookup[cardId]?.name ?? cardId;
}

function normalizeCardList(cards: Array<Record<string, unknown> | null> | undefined, cardLookup: Record<string, any>) {
  return (cards ?? [])
    .filter(Boolean)
    .map((raw) => {
      const card = raw as Record<string, unknown>;
      const defId = String(card.definitionId ?? "");
      const name = cardName(cardLookup, defId);
      const attack = card.attack ?? cardLookup[defId]?.attack ?? cardLookup[defId]?.attackPoints ?? 0;
      const flags: string[] = [];
      if (card.faceDown) return "Face-down";
      if (card.canAttack) flags.push("can-attack");
      if (card.hasAttackedThisTurn) flags.push("attacked");
      return `${name} ATK=${attack}${flags.length ? ` (${flags.join(",")})` : ""}`;
    })
    .join(", ");
}

function summarizeView(label: string, view: PlayerView | null, cardLookup: Record<string, any>) {
  if (!view) return `${label}: <no view>`;
  const board = normalizeCardList(view.board, cardLookup) || "none";
  const oppBoard = normalizeCardList(view.opponentBoard, cardLookup) || "none";
  return [
    `${label}:`,
    `  turn=${view.currentTurnPlayer ?? "?"}`,
    `  phase=${view.currentPhase ?? "?"}`,
    `  lp=${view.lifePoints ?? 0}/${view.opponentLifePoints ?? 0}`,
    `  hand=${view.hand?.length ?? 0} (opp hand unknown=${view.opponentHandCount ?? "?"})`,
    `  board=[${board}]`,
    `  oppBoard=[${oppBoard}]`,
    `  deck=${view.deckCount ?? "?"}/${view.opponentDeckCount ?? "?"}`,
  ].join(" | ");
}

function emitCutscene(lines: string[] | undefined, header: string) {
  if (!lines?.length) return;
  console.log(`\n=== ${header} ===`);
  for (const line of lines) {
    console.log(line);
  }
  console.log("=== end ===\n");
}

function parseEvents(events: unknown[]): string[] {
  const lines: string[] = [];
  for (const e of events) {
    const event = e as GameEvent;
    const eventList = (() => {
      if (!event || typeof event.events !== "object") {
        if (typeof event?.events === "string") {
          try {
            return JSON.parse(event.events);
          } catch {
            return [event.events];
          }
        }
        return [];
      }
      return event.events ?? [];
    })();

    const list = Array.isArray(eventList) ? eventList : [eventList];
    for (const item of list) {
      if (!item || typeof item !== "object") {
        lines.push(String(item));
        continue;
      }
      const payload = (item as Record<string, unknown>).payload
        ? ` payload=${JSON.stringify((item as Record<string, unknown>).payload)}`
        : "";
      const playerSeat = (item as Record<string, unknown>).playerSeat;
      const player = (item as Record<string, unknown>).player;
      const winner = (item as Record<string, unknown>).winner;
      const reason = (item as Record<string, unknown>).reason;
      const type = String((item as Record<string, unknown>).type ?? "UNKNOWN");
      const prefix = playerSeat ? `[${playerSeat}] ` : "";
      const suffix = `${player ? ` player=${player}` : ""}${winner ? ` winner=${winner}` : ""}${reason ? ` reason=${reason}` : ""}${payload}`;
      lines.push(`${prefix}${type}${suffix}`);
    }
  }
  return lines;
}

function signature(view: PlayerView) {
  return JSON.stringify({
    turn: view.currentTurnPlayer,
    phase: view.currentPhase,
    hand: [...(view.hand ?? [])].sort().join(","),
    boardCount: view.board?.length ?? 0,
    oppBoardCount: view.opponentBoard?.length ?? 0,
    deck: view.deckCount,
    oppDeck: view.opponentDeckCount,
    chain: view.currentChain?.length ?? 0,
    gameOver: view.gameOver ?? false,
  });
}

async function loadSeatView(matchId: string, seat: Seat) {
  const raw = await convex.query(api.game.getPlayerView, { matchId, seat });
  if (!raw) return null;
  return JSON.parse(raw) as PlayerView;
}

function pickTributeCards(view: PlayerView, cardLookup: Record<string, any>): string[] | undefined {
  const board = (view.board ?? []).filter(Boolean) as Array<{ cardId: string; definitionId: string }>;
  if (board.length === 0) return undefined;
  const sorted = [...board].sort((a, b) => {
    const atkA = Number(cardLookup[a.definitionId]?.attack ?? 0);
    const atkB = Number(cardLookup[b.definitionId]?.attack ?? 0);
    return atkA - atkB;
  });
  return [sorted[0].cardId];
}

function chooseMainPhaseCommand(
  view: PlayerView,
  cardLookup: Record<string, any>,
) {
  const monsters = (view.hand ?? [])
    .map((cardId) => ({ cardId, def: cardLookup[cardId] }))
    .filter((entry) => entry.def && entry.def.cardType === "stereotype")
    .map((entry) => ({
      ...entry,
      attack: Number(entry.def?.attack ?? 0),
      level: Number(entry.def?.level ?? 0),
    }))
    .sort((a, b) => b.attack - a.attack);

  const boardCount = (view.board ?? []).filter(Boolean).length;

  if (boardCount < 5 && monsters.length > 0) {
    const candidate = monsters[0];
    const tribute = candidate.level >= 7 ? pickTributeCards(view, cardLookup) : undefined;
    return {
      type: "SUMMON" as const,
      cardId: candidate.cardId,
      position: "attack" as const,
      tributeCardIds: tribute,
      _log: `summon ${cardName(cardLookup, candidate.cardId)} (lvl ${candidate.level})`,
    };
  }

  const backrow = (view.hand ?? [])
    .find((cardId) => {
      const def = cardLookup[cardId];
      return def && (def.cardType === "spell" || def.cardType === "trap");
    });

  if (backrow) {
    return {
      type: "SET_SPELL_TRAP" as const,
      cardId: backrow,
      _log: `set ${cardName(cardLookup, backrow)}`,
    };
  }

  const spell = (view.hand ?? []).find((cardId) => {
    const def = cardLookup[cardId];
    return def && def.cardType === "spell";
  });
  if (spell) {
    return {
      type: "ACTIVATE_SPELL" as const,
      cardId: spell,
      _log: `activate ${cardName(cardLookup, spell)}`,
    };
  }

  return {
    type: "ADVANCE_PHASE" as const,
    _log: "advance phase",
  };
}

function chooseCombatCommand(view: PlayerView, cardLookup: Record<string, any>) {
  const attackers = (view.board ?? [])
    .filter(Boolean)
    .filter((raw) => {
      const c = raw as { faceDown?: boolean; canAttack?: boolean; hasAttackedThisTurn?: boolean };
      return !c.faceDown && c.canAttack && !c.hasAttackedThisTurn;
    });

  if (attackers.length === 0) {
    return { type: "ADVANCE_PHASE" as const, _log: "advance phase" };
  }

  const attacker = attackers[0] as Record<string, unknown>;
  const opponentMonsters = (view.opponentBoard ?? [])
    .filter(Boolean)
    .filter((raw) => !((raw as Record<string, unknown>).faceDown));

  if (opponentMonsters.length === 0) {
    return {
      type: "DECLARE_ATTACK" as const,
      attackerId: String(attacker.cardId ?? ""),
      _log: `attack direct with ${cardName(cardLookup, String(attacker.definitionId ?? attacker.cardId))}`,
    };
  }

  const orderedTargets = [...opponentMonsters].sort((a, b) => {
    const atkA = Number(cardLookup[String((a as Record<string, unknown>).definitionId)]?.attack ?? 0);
    const atkB = Number(cardLookup[String((b as Record<string, unknown>).definitionId)]?.attack ?? 0);
    return atkA - atkB;
  });
  const target = orderedTargets[0] as Record<string, unknown>;

  return {
    type: "DECLARE_ATTACK" as const,
    attackerId: String(attacker.cardId ?? ""),
    targetId: String(target.cardId ?? ""),
    _log: `attack ${cardName(cardLookup, String(target.definitionId ?? target.cardId))} with ${cardName(cardLookup, String(attacker.definitionId ?? attacker.cardId))}`,
  };
}

function choosePhaseCommand(view: PlayerView, cardLookup: Record<string, any>) {
  if (["draw", "standby", "breakdown_check", "end"].includes(view.currentPhase ?? "")) {
    return { type: "ADVANCE_PHASE" as const, _log: "advance phase" };
  }

  if (view.currentPhase === "main" || view.currentPhase === "main2") {
    return chooseMainPhaseCommand(view, cardLookup);
  }

  if (view.currentPhase === "combat") {
    return chooseCombatCommand(view, cardLookup);
  }

  return { type: "END_TURN" as const, _log: "end turn" };
}

function stripCommandLog(
  command: Record<string, unknown> & { _log?: string },
) {
  const { _log, ...rest } = command;
  return { ...rest };
}

async function trySubmit(
  matchId: string,
  seat: Seat,
  command: Record<string, unknown>,
  seatLabel?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await convex.mutation(api.game.submitAction, {
      matchId,
      seat,
      command: JSON.stringify(command),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error as Error).message ?? error) };
  }
}

async function performSeatTurn(
  matchId: string,
  seat: Seat,
  cardLookup: Record<string, any>,
) {
  const actions: string[] = [];
  let stagnant = 0;

  for (let step = 0; step < MAX_PHASE_COMMANDS; step += 1) {
    const view = await loadSeatView(matchId, seat);
    if (!view || view.currentTurnPlayer !== seat || view.gameOver) break;

    const selectedCommand = choosePhaseCommand(view, cardLookup) as Record<string, unknown> & {
      _log?: string;
    };
    const command = stripCommandLog(selectedCommand);
    const logLabel = selectedCommand._log || selectedCommand.type;

    const submitted = await trySubmit(matchId, seat, command, seat);
    actions.push(`${seat} -> ${logLabel} [${selectedCommand.type}]`);
    if (!submitted.ok) {
      if (selectedCommand.type !== "END_TURN") {
        const fallback = { type: "END_TURN" } as const;
        const fallbackResult = await trySubmit(matchId, seat, fallback);
        if (fallbackResult.ok) {
          actions.push(`${seat} -> fallback end turn`);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    const next = await loadSeatView(matchId, seat);
    if (!next || next.currentTurnPlayer !== seat) break;

    if (next.gameOver || signature(next) === signature(view)) {
      stagnant += 1;
      if (stagnant >= 2) break;
    } else {
      stagnant = 0;
    }
  }

  return actions;
}

function parseOutcome(meta: Record<string, any> | null, finalView: PlayerView | null, stage: StageData | null) {
  const winner = (meta?.winner ?? null) as "host" | "away" | null;
  if (!winner) return { outcome: "draw", stars: 0, rewards: { gold: 0, xp: 0 } };

  const won = winner === "host";
  const finalLP = finalView?.lifePoints ?? 0;
  const stars = won
    ? finalLP >= 6000
      ? 3
      : finalLP >= 4500
        ? 2
        : 1
    : 0;
  return {
    outcome: won ? "won" : "lost",
    stars,
    rewards: {
      gold: won ? stage?.rewardGold ?? 0 : 0,
      xp: won ? stage?.rewardXp ?? 0 : 0,
    },
  };
}

async function ensureStarterDeck(agentUserId: string): Promise<void> {
  const starters = await convex.query(api.game.getStarterDecks, {});
  const deckCode = starters?.[0]?.deckCode;
  if (!deckCode) throw new Error("No starter decks found");

  try {
    const result = await convex.mutation(api.agentAuth.agentSelectStarterDeck, {
      agentUserId,
      deckCode,
    });
    console.log("Selected starter deck:", result);
  } catch (error) {
    const message = String((error as Error).message ?? error);
    if (message.includes("already have") || message.includes("already has")) {
      console.log("Starter deck already assigned for this agent; continuing with active deck.");
      return;
    }
    throw error;
  }
}

async function main() {
  console.log(`=== STORY PLAYTEST RUN ${runId} ===`);
  const cardLookup = await loadCardLookup();
  const reg = await convex.mutation(api.agentAuth.registerAgent, {
    name: `story-selftest-${runId}`,
    apiKeyHash: `hash_${runId}`,
    apiKeyPrefix: `ltcg_${runId.slice(-8)}`,
  });
  console.log("Registered agent:", reg);

  // Convex id("users") values are structurally strings at runtime; keep this script runtime-focused.
  await ensureStarterDeck(String(reg.userId));

  const chapters = await convex.query(api.game.getChapters, {});
  if (!chapters || chapters.length === 0) throw new Error("No chapter found");
  const chapter = chapters[0];
  const stageNum = 1;
  console.log(`Using chapter ${chapter._id} (${chapter.title ?? chapter.name ?? "untitled"}), stage ${stageNum}`);

  const stage = await convex.query(api.game.getStageWithNarrative, {
    chapterId: chapter._id,
    stageNumber: stageNum,
  });
  emitCutscene(stage?.narrative?.preMatchDialogue, "Narrative Context (Pre-Match)");

  const start = await convex.mutation(api.agentAuth.agentStartBattle, {
    agentUserId: reg.userId,
    chapterId: chapter._id,
    stageNumber: stageNum,
  });
  const matchId = start.matchId;
  console.log(`Started story match: ${matchId}`);

  const context = await convex.query(api.game.getStoryMatchContext, { matchId });
  console.log(
    `Context priming: chapter=${context?.chapterId} stage=${context?.stageNumber} opponent=${context?.opponentName ?? stage?.opponentName ?? "AI Opponent"}`,
  );

  let steps = 0;
  let lastEventVersion = -1;
  let staleTicks = 0;
  let hostSig = "";
  let awaySig = "";
  let turnCount = 0;

  while (steps < MAX_STEPS) {
    const [meta, hostView, awayView, events] = await Promise.all([
      convex.query(api.game.getMatchMeta, { matchId }),
      loadSeatView(matchId, "host"),
      loadSeatView(matchId, "away"),
      convex.query(api.game.getRecentEvents, { matchId, sinceVersion: lastEventVersion }),
    ]);

    if (meta?.status === "ended" && hostView?.gameOver) {
      console.log("Game over detected.");
      break;
    }

    if (events.length > 0) {
      const parsed = parseEvents(events as unknown[]);
      for (const line of parsed) console.log(`[event] ${line}`);
      lastEventVersion = Math.max(
        ...((events as GameEvent[]).map((e) => Number(e.version ?? 0)).filter((n) => !Number.isNaN(n))),
      );
    }

    const hp = `${hostView?.lifePoints ?? 0}/${hostView?.opponentLifePoints ?? 0}`;
    const hSig = hostView ? signature(hostView) : "";
    const aSig = awayView ? signature(awayView) : "";
    staleTicks = hSig === hostSig && aSig === awaySig ? staleTicks + 1 : 0;
    hostSig = hSig;
    awaySig = aSig;

    console.log(`\n[TICK ${steps}] status=${meta?.status} reason=${meta?.endReason ?? "n/a"} turn=${hostView?.currentTurnPlayer} phase=${hostView?.currentPhase} hp=${hp} stale=${staleTicks}`);
    console.log(summarizeView("HOST", hostView, cardLookup));
    if (awayView) console.log(summarizeView("AWAY", awayView, cardLookup));

    if (meta?.status === "ended" || hostView?.gameOver || awayView?.gameOver) {
      console.log("Match ended.");
      break;
    }

    const actions: string[] = [];
    if (hostView?.currentTurnPlayer === "host") {
      const result = await performSeatTurn(matchId, "host", cardLookup);
      actions.push(...result);
      turnCount += 1;
    }

    if (awayView?.currentTurnPlayer === "away") {
      const result = await performSeatTurn(matchId, "away", cardLookup);
      actions.push(...result);
      if (result.length > 0) turnCount += 1;
    }

    if (actions.length === 0) {
      const fallbackSeat = hostView?.currentTurnPlayer === "away"
        ? "away"
        : "host";
      const fallback = await performSeatTurn(matchId, fallbackSeat, cardLookup);
      actions.push(...fallback);
      if (fallback.length > 0) turnCount += 1;
    }

    if (actions.length > 0) {
      console.log("Turn actions:");
      for (const action of actions) console.log(`  - ${action}`);
    }

    if (staleTicks >= STALE_GLOBAL_LIMIT) {
      console.log("Stale state exceeded global limit, forcing finalization attempt.");
      const fallback = await performSeatTurn(matchId, (hostView?.currentTurnPlayer ?? "host"), cardLookup);
      if (fallback.length > 0) {
        for (const action of fallback) console.log(`  - ${action}`);
      }
      staleTicks = 0;
    }

    if (staleTicks >= STALE_TURN_LIMIT && (hostView || awayView)) {
      console.log("Local stall detected; waiting for state progression heartbeat.");
      await sleep(700);
    }

    steps += 1;
    await sleep(180);
  }

  const finalMeta = await convex.query(api.game.getMatchMeta, { matchId });
  const finalView = await loadSeatView(matchId, "host");
  const finalStory = await convex.query(api.game.getStageWithNarrative, {
    chapterId: chapter._id,
    stageNumber: stageNum,
  });

  console.log("\n=== MATCH FINISHED ===");
  console.log({
    status: finalMeta?.status,
    winner: finalMeta?.winner,
    endReason: finalMeta?.endReason,
    hostLP: finalView?.lifePoints,
    awayLP: finalView?.opponentLifePoints,
    turns: turnCount,
    steps,
  });

  let completion: unknown = null;
  try {
    completion = await convex.mutation(api.game.completeStoryStage, { matchId } as any);
  } catch (error) {
    console.log(
      "completeStoryStage unavailable for this agent context:",
      String((error as Error).message ?? error),
    );
    completion = { ...parseOutcome(finalMeta as Record<string, any> | null, finalView, finalStory), derived: true };
  }

  console.log("\n=== STAGE COMPLETION ===");
  console.log(completion);

  const finalStoryContext = await convex.query(api.game.getStoryMatchContext, { matchId });
  const won = finalStoryContext?.outcome === "won" || finalMeta?.winner === "host";
  emitCutscene(
    won
      ? finalStory?.narrative?.postMatchWinDialogue
      : finalStory?.narrative?.postMatchLoseDialogue,
    "Post-Match Narrative",
  );

  console.log("\n=== END REPORT ===");
  console.log(
    JSON.stringify(
      {
        matchId,
        outcome: finalStoryContext?.outcome ?? (won ? "won" : "lost"),
        turns: turnCount,
        steps,
        stars: finalStoryContext?.starsEarned ?? parseOutcome(finalMeta as Record<string, any> | null, finalView, finalStory).stars,
        rewards: {
          gold: finalStoryContext?.rewardsGold ?? 0,
          xp: finalStoryContext?.rewardsXp ?? 0,
          bonus: finalStoryContext?.firstClearBonus ?? 0,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[run-full-story-playtest] failed", error);
  process.exit(1);
});
