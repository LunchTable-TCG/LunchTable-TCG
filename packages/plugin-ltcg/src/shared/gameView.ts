/** Shared helpers for resolving phase and life-point views across plugin actions/routes. */

export type Seat = "host" | "away";

type PhaseCandidate = {
  currentPhase?: string;
  phase?: string;
};

type LifePointCandidate = {
  lifePoints?: number;
  opponentLifePoints?: number;
  players?: {
    host?: {
      lifePoints?: number;
    };
    away?: {
      lifePoints?: number;
    };
  };
};

export function resolvePhase(view: PhaseCandidate): string {
  return view.currentPhase ?? view.phase ?? "draw";
}

export function resolveLifePoints(
  view: LifePointCandidate,
  seat: Seat = "host",
): { myLP: number; oppLP: number } {
  const hostLife =
    view.players?.host?.lifePoints ?? view.lifePoints;
  const awayLife =
    view.players?.away?.lifePoints ?? view.opponentLifePoints;

  const normalizedHost =
    hostLife === undefined || Number.isNaN(hostLife) ? 0 : hostLife;
  const normalizedAway =
    awayLife === undefined || Number.isNaN(awayLife) ? 0 : awayLife;

  return seat === "host"
    ? { myLP: normalizedHost, oppLP: normalizedAway }
    : { myLP: normalizedAway, oppLP: normalizedHost };
}

