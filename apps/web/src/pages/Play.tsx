import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexQuery, useConvexMutation } from "@/lib/convexHelpers";
import { VictoryScreen } from "@/components/story";
import { GameBoard } from "@/components/game/GameBoard";
import { type Seat } from "@/components/game/hooks/useGameState";
import { normalizeMatchId } from "@/lib/matchIds";

type MatchMeta = {
  status: string;
  hostId: string;
  awayId: string;
  mode: string;
  isAIOpponent?: boolean;
  winner?: string;
};

type CurrentUser = {
  _id: string;
};

type StoryCompletion = {
  outcome: string;
  starsEarned: number;
  rewards: { gold: number; xp: number; firstClearBonus: number };
};

type StoryContext = {
  matchId: string;
  userId: string;
  chapterId: string;
  stageNumber: number;
  stageId: string;
  outcome: string | null;
  starsEarned: number | null;
  rewardsGold: number;
  rewardsXp: number;
  firstClearBonus: number;
  opponentName: string;
  postMatchWinDialogue: string[];
  postMatchLoseDialogue: string[];
};

export function Play() {
  const { matchId } = useParams<{ matchId: string }>();
  const activeMatchId = normalizeMatchId(matchId);

  const meta = useConvexQuery(
    apiAny.game.getMatchMeta,
    activeMatchId ? { matchId: activeMatchId } : "skip",
  ) as MatchMeta | null | undefined;

  // Story context — only loads for story mode matches
  const isStory = meta?.mode === "story";
  const storyCtx = useConvexQuery(
    apiAny.game.getStoryMatchContext,
    isStory && activeMatchId ? { matchId: activeMatchId } : "skip",
  ) as StoryContext | null | undefined;

  const currentUser = useConvexQuery(
    apiAny.auth.currentUser,
    "skip",
  ) as CurrentUser | null | undefined;

  const completeStage = useConvexMutation(apiAny.game.completeStoryStage);

  const [completion, setCompletion] = useState<StoryCompletion | null>(null);
  const completingRef = useRef(false);

  const playerSeat = resolvePlayerSeat(currentUser ?? null, meta, isStory);

  const storyWon = resolveStoryWon(meta?.winner, playerSeat);

  // Auto-complete story stage when match ends
  useEffect(() => {
    if (!isStory || !activeMatchId || !meta?.winner || completion || completingRef.current) return;
    if (meta?.status !== "ended") return;

    completingRef.current = true;
    completeStage({ matchId: activeMatchId })
      .then((result: StoryCompletion) => setCompletion(result))
      .catch((err: any) => {
        Sentry.captureException(err);
        // Fallback — still show result
        const won = storyWon;
        setCompletion({
          outcome: won ? "won" : "lost",
          starsEarned: won ? 1 : 0,
          rewards: { gold: 0, xp: 0, firstClearBonus: 0 },
        });
      });
  }, [
    isStory,
    activeMatchId,
    meta?.status,
    meta?.winner,
    storyWon,
    completion,
    completeStage,
  ]);

  // Loading
  if (!activeMatchId) return <CenterMessage>Invalid match ID.</CenterMessage>;
  if (meta === undefined) return <Loading />;
  if (meta === null) return <CenterMessage>Match not found.</CenterMessage>;
  if (currentUser === undefined) return <Loading />;
  if (currentUser === null) return <CenterMessage>Unable to load player.</CenterMessage>;
  if (!playerSeat) return <CenterMessage>You are not a player in this match.</CenterMessage>;

  // Story mode completion screen
  if (isStory && meta.status === "ended" && completion) {
    const won = storyWon;
    return (
      <VictoryScreen
        won={won}
        starsEarned={completion.starsEarned}
        rewards={completion.rewards}
        storyPath={storyCtx?.chapterId ? `/story/${storyCtx.chapterId}` : "/story"}
      />
    );
  }

  // Active game (GameBoard handles game over for non-story matches)
  return <GameBoard matchId={activeMatchId} seat={playerSeat} />;
}

function resolveStoryWon(winner: string | undefined, seat: Seat | null): boolean {
  if (!winner) return false;
  return winner === seat;
}

function resolvePlayerSeat(
  currentUser: CurrentUser | null,
  meta: MatchMeta | null | undefined,
  isStory: boolean,
): Seat | null {
  if (!currentUser || !meta) return null;
  if (currentUser._id === meta.hostId) return "host";
  if (currentUser._id === meta.awayId) return "away";
  if (isStory && meta.isAIOpponent && meta.awayId === "cpu") return "host";
  if (isStory && meta.isAIOpponent && meta.hostId === "cpu") return "away";
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
      <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
      <p className="text-[#666] font-bold uppercase text-sm">{children}</p>
    </div>
  );
}
