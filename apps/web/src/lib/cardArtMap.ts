/**
 * Maps card names (lowercased, trimmed) to art image paths in /game-assets/cards/.
 * Falls back to undefined when no art exists — callers show the archetype gradient instead.
 */
const ART_MAP: Record<string, string> = {
  "afterparty goblin": "/game-assets/cards/afterparty_goblin.png",
  "attendance award annie": "/game-assets/cards/attendance_award_annie.png",
  "back alley bookie": "/game-assets/cards/back_alley_bookie.png",
  "corporate ladder chad": "/game-assets/cards/corporate_ladder_chad.png",
  "debate team captain": "/game-assets/cards/debate_team_captain.png",
  "debugging dana": "/game-assets/cards/debugging_dana.png",
};

/** Frame images by card type */
export const FRAME_MAP: Record<string, string> = {
  stereotype: "/game-assets/frames/frame-monster.png",
  monster: "/game-assets/frames/frame-monster.png",
  spell: "/game-assets/frames/frame-spell.png",
  trap: "/game-assets/frames/frame-trap.png",
  environment: "/game-assets/frames/frame-environment.png",
  field: "/game-assets/frames/frame-environment.png",
};

/** Card back texture path */
export const CARD_BACK_PATH = "/game-assets/frames/card-back.png";

/** Playmat texture path */
export const PLAYMAT_PATH = "/game-assets/board/playmat.png";

export function getCardArt(name?: string): string | undefined {
  if (!name) return undefined;
  return ART_MAP[name.toLowerCase().trim()];
}

export function getCardFrame(cardType?: string): string {
  if (!cardType) return FRAME_MAP.stereotype!;
  return FRAME_MAP[cardType.toLowerCase()] ?? FRAME_MAP.stereotype!;
}
