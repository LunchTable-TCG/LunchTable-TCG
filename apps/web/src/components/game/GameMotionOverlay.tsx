import {useEffect, useState} from "react";
import type {Phase} from "@lunchtable-tcg/engine";

const GAMEPLAY_AMBIENT_SRC = "/lunchtable/ui-motion/gameplay-ambient-loop.mp4";

const PHASE_TINT: Record<Phase, string> = {
  draw: "rgba(255, 204, 0, 0.24)",
  standby: "rgba(255, 239, 153, 0.2)",
  main: "rgba(254, 240, 138, 0.22)",
  combat: "rgba(255, 99, 71, 0.24)",
  main2: "rgba(255, 212, 128, 0.2)",
  breakdown_check: "rgba(153, 102, 255, 0.2)",
  end: "rgba(51, 204, 255, 0.22)",
};

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}

type GameMotionOverlayProps = {
  phase: Phase;
  isMyTurn: boolean;
};

export function GameMotionOverlay({phase, isMyTurn}: GameMotionOverlayProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [videoUnavailable, setVideoUnavailable] = useState(false);

  if (prefersReducedMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {!videoUnavailable ? (
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-[0.16] mix-blend-multiply"
          src={GAMEPLAY_AMBIENT_SRC}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onError={() => setVideoUnavailable(true)}
        />
      ) : null}

      <div
        className="absolute inset-0 transition-colors duration-500"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 38%, rgba(18, 18, 18, 0.14) 100%)",
        }}
      />

      <div
        className="absolute inset-0 transition-colors duration-500"
        style={{
          background: `linear-gradient(180deg, ${PHASE_TINT[phase]}, transparent 42%, transparent 58%, ${PHASE_TINT[phase]})`,
          opacity: isMyTurn ? 1 : 0.58,
        }}
      />

      {isMyTurn ? (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(255, 204, 0, 0.12), transparent 62%)",
            animation: "effect-pulse 2.2s ease-in-out infinite",
          }}
        />
      ) : null}
    </div>
  );
}
