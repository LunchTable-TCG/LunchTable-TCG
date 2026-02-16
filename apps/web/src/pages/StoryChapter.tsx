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
  const { pushEvents } = useStory();

  const stages = useConvexQuery(
    apiAny.game.getChapterStages,
    chapterId ? { chapterId } : "skip",
  ) as Stage[] | undefined;

  const startBattle = useConvexMutation(apiAny.game.startStoryBattle);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState("");

  const sorted = [...(stages ?? [])].sort((a, b) => a.stageNumber - b.stageNumber);

  const handleStartBattle = async (stage: Stage) => {
    if (!chapterId) return;
    setStarting(stage.stageNumber);
    setError("");

    try {
      // Play pre-match dialogue if available
      if (stage.preMatchDialogue && stage.preMatchDialogue.length > 0) {
        pushEvents([{ type: "dialogue", lines: stage.preMatchDialogue }]);
      }

      // Battle transition
      pushEvents([{ type: "transition", variant: "battle-start" }]);

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
              // First panel spans full width + taller, rest split bottom row
              const isHero = i === 0;
              return (
                <div
                  key={stage._id}
                  className={isHero ? "col-span-2 h-[280px] md:h-[340px]" : "col-span-1 h-[200px] md:h-[260px]"}
                >
                  <StagePanel
                    stage={stage}
                    isStarting={starting === stage.stageNumber}
                    onFight={() => handleStartBattle(stage)}
                    chapterId={chapterId}
                  />
                </div>
              );
            })}
          </motion.div>
        )}

        {error && (
          <p className="text-red-600 text-sm font-bold uppercase text-center mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}
