import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { motion } from "framer-motion";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexQuery, useConvexMutation } from "@/lib/convexHelpers";
import {
  StoryProvider,
  StagePanel,
  DialogueBox,
  BattleTransition,
  useStory,
  type Stage,
} from "@/components/story";
import { TrayNav } from "@/components/layout/TrayNav";
import { STAGES_BG, QUESTIONS_LABEL } from "@/lib/blobUrls";
import { normalizeMatchId } from "@/lib/matchIds";

type StarterDeck = {
  deckCode: string;
  name?: string;
};

const RESERVED_DECK_IDS = new Set(["undefined", "null", "skip"]);
const normalizeDeckId = (deckId: string | undefined): string | null => {
  if (!deckId) return null;
  const trimmed = deckId.trim();
  if (!trimmed) return null;
  if (RESERVED_DECK_IDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

export function StoryChapter() {
  return (
    <StoryProvider>
      <StoryChapterInner />
      <DialogueBox />
      <BattleTransition />
      <TrayNav />
    </StoryProvider>
  );
}

function StoryChapterInner() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const { chapters, isStageComplete, isChapterUnlocked } = useStory();
  const currentUser = useConvexQuery(
    apiAny.auth.currentUser,
    chapterId ? {} : "skip",
  ) as { activeDeckId?: string } | null | undefined;

  const stages = useConvexQuery(
    apiAny.game.getChapterStages,
    chapterId ? { chapterId } : "skip",
  ) as Stage[] | undefined;
  const userDecks = useConvexQuery(
    apiAny.game.getUserDecks,
    chapterId ? {} : "skip",
  ) as { deckId: string }[] | undefined;
  const starterDecks = useConvexQuery(
    apiAny.game.getStarterDecks,
    chapterId ? {} : "skip",
  ) as StarterDeck[] | undefined;

  const startBattle = useConvexMutation(apiAny.game.startStoryBattle);
  const startBattleForAgent = useConvexMutation(apiAny.game.startStoryBattleForAgent);
  const selectStarterDeck = useConvexMutation(apiAny.game.selectStarterDeck);
  const setActiveDeck = useConvexMutation(apiAny.game.setActiveDeck);
  const cancelStoryMatch = useConvexMutation(apiAny.game.cancelWaitingStoryMatch);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [agentMatch, setAgentMatch] = useState<{ matchId: string; stageNumber: number } | null>(
    null,
  );
  const [copyMessage, setCopyMessage] = useState("");

  const ensureActiveDeck = async () => {
    const activeDeckId = normalizeDeckId(currentUser?.activeDeckId);
    const hasActiveDeck = Boolean(
      activeDeckId && userDecks?.some((deck) => normalizeDeckId(deck.deckId) === activeDeckId),
    );
    if (hasActiveDeck) return;

    const firstDeckId = normalizeDeckId(userDecks?.[0]?.deckId);
    if (firstDeckId) {
      await setActiveDeck({ deckId: firstDeckId });
      return;
    }

    const defaultDeck = starterDecks?.[0]?.deckCode;
    if (!defaultDeck) {
      throw new Error("No starter deck is configured.");
    }
    await selectStarterDeck({ deckCode: defaultDeck });
  };

  const sorted = [...(stages ?? [])].sort((a, b) => a.stageNumber - b.stageNumber);

  const sortedChapters = [...(chapters ?? [])].sort((a, b) => {
    const actDiff = (a.actNumber ?? 0) - (b.actNumber ?? 0);
    if (actDiff !== 0) return actDiff;
    const chapterDiff = (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0);
    if (chapterDiff !== 0) return chapterDiff;
    return 0;
  });

  const currentChapter = sortedChapters.find((c) => c._id === chapterId);
  const chapterUnlocked = chapterId && currentChapter ? isChapterUnlocked(chapterId) : false;

  const handleStartBattle = async (stage: Stage) => {
    if (!chapterId) return;
    setStarting(stage.stageNumber);
    setError("");

    try {
      await ensureActiveDeck();
      const result = await startBattle({
        chapterId,
        stageNumber: stage.stageNumber,
      }) as { matchId?: string };

      const nextMatchId = normalizeMatchId(typeof result?.matchId === "string" ? result.matchId : null);
      if (!nextMatchId) {
        throw new Error("No match ID was returned from the battle starter.");
      }

      navigate(`/play/${nextMatchId}`);
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err.message ?? "Failed to start battle.");
    } finally {
      setStarting(null);
    }
  };

  const handleStartBattleForAgent = async (stage: Stage) => {
    if (!chapterId) return;
    setStarting(stage.stageNumber);
    setError("");
    setCopyMessage("");

    try {
      await ensureActiveDeck();
      const result = await startBattleForAgent({
        chapterId,
        stageNumber: stage.stageNumber,
      }) as { matchId?: string; stageNumber?: number };

      const nextMatchId = normalizeMatchId(typeof result?.matchId === "string" ? result.matchId : null);
      if (!nextMatchId) {
        throw new Error("No match ID was returned from the match creator.");
      }

      setAgentMatch({
        matchId: nextMatchId,
        stageNumber: typeof result.stageNumber === "number" ? result.stageNumber : stage.stageNumber,
      });
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err.message ?? "Failed to create agent matchup.");
    } finally {
      setStarting(null);
    }
  };

  const handleCopyAgentMatch = async () => {
    if (!agentMatch?.matchId) return;
    await navigator.clipboard.writeText(agentMatch.matchId);
    setCopyMessage("Match ID copied.");
    setTimeout(() => setCopyMessage(""), 2200);
  };

  const handleCancelAgentMatch = async () => {
    if (!agentMatch?.matchId) return;
    try {
      await cancelStoryMatch({
        matchId: agentMatch.matchId,
      }) as { canceled: boolean };
      setAgentMatch(null);
      setCopyMessage("");
    } catch (err: any) {
      setError(err.message ?? "Failed to cancel match lobby.");
    }
  };

  return (
    <div
      className="min-h-screen pb-24 relative bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${STAGES_BG}')` }}
    >
      <div className="absolute inset-0 bg-[#fdfdfb]/80" />
      <header className="relative z-10 border-b-2 border-[#121212] px-6 py-5">
        <button
          type="button"
          onClick={() => navigate("/story")}
          className="text-xs font-bold uppercase tracking-wider text-[#666] hover:text-[#121212] transition-colors mb-2 block text-center"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          &larr; Back to homework
        </button>
        <img
          src={QUESTIONS_LABEL}
          alt="QUESTIONS"
          className="h-28 md:h-36 mx-auto"
          draggable={false}
        />
      </header>

      {/* Comic page */}
      <div className="relative z-10 p-4 md:p-6 max-w-3xl mx-auto">
        {!stages ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="paper-panel p-12 text-center">
            <p className="text-[#666] font-bold uppercase text-sm">
              No stages in this chapter yet.
            </p>
          </div>
        ) : (
        <motion.div
          className="comic-page grid grid-cols-2 gap-[6px] border-[3px] border-[#121212] bg-[#121212] shadow-zine"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
        >
          {sorted.map((stage, i) => {
            const previousStage =
              sorted.find((candidate) => candidate.stageNumber === stage.stageNumber - 1) ??
              null;
            const isPreviousClear =
              stage.stageNumber === 1
                ? true
                : previousStage
                  ? isStageComplete(previousStage._id)
                  : false;
            const locked = !chapterUnlocked || !isPreviousClear;
            const isHero = i === 0;

            // First panel spans full width + taller, rest split bottom row
            return (
              <div
                key={stage._id}
                className={
                  isHero
                    ? "col-span-2 h-[280px] md:h-[340px]"
                    : "col-span-1 h-[200px] md:h-[260px]"
                }
              >
                <StagePanel
                  stage={stage}
                  isStarting={starting === stage.stageNumber}
                  onFight={() => handleStartBattle(stage)}
                  onHostAgentFight={() => handleStartBattleForAgent(stage)}
                  chapterId={chapterId}
                  locked={locked}
                />
              </div>
            );
          })}
        </motion.div>
        )}

        {agentMatch && (
          <div className="mt-4 paper-panel p-4 text-xs text-[#666]">
            <p className="font-bold uppercase tracking-wider text-[#121212] mb-1">
              Autonomous opponent lobby open
            </p>
            <p className="text-[11px]">
              Share this match ID with the ElizaOS agent:
            </p>
            <p className="font-mono break-all text-[#111] mt-1 mb-2">
              {agentMatch.matchId}
            </p>
            <button
              type="button"
              onClick={handleCopyAgentMatch}
              className="text-[10px] font-bold uppercase tracking-wider bg-[#121212] text-[#ffcc00] px-3 py-2 rounded-sm"
            >
              Copy Match ID
            </button>
            <button
              type="button"
              onClick={handleCancelAgentMatch}
              className="text-[10px] font-bold uppercase tracking-wider bg-[#ffcc00] text-[#121212] px-3 py-2 rounded-sm ml-2"
            >
              Cancel Lobby
            </button>
            {copyMessage && <p className="mt-1 text-[#38a169] font-bold">{copyMessage}</p>}
            <p className="text-[10px] mt-2">
              Agent should call JOIN_LTCG_MATCH with this ID.
            </p>
          </div>
        )}

        {error && (
          <p className="text-red-600 text-sm font-bold uppercase text-center mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}
