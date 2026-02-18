export const TELEGRAM_FALLBACK_URL = "https://telegram.org";

export function sanitizeTelegramBotUsername(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim().replace(/^@/, "");
  if (!value) return null;
  // Telegram username rules (bots too): 5-32 chars, letters/digits/underscore.
  // We keep this strict so we don't generate malformed deep links.
  if (!/^[A-Za-z0-9_]{5,32}$/.test(value)) return null;
  return value;
}

export function sanitizeTelegramMiniAppShortName(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  // Bot app short names are restricted; keep strict to avoid broken links.
  if (!/^[A-Za-z0-9_]{3,64}$/.test(value)) return null;
  return value;
}

export function buildTelegramMiniAppStartParam(matchId?: string): string {
  return matchId ? `m_${matchId}` : "home";
}

export function buildTelegramMainMiniAppLink(botUsername: string, startParam: string): string {
  return `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`;
}

export function buildTelegramDirectMiniAppLink(
  botUsername: string,
  miniAppShortName: string,
  startParam: string,
): string {
  return `https://t.me/${botUsername}/${miniAppShortName}?startapp=${encodeURIComponent(startParam)}`;
}

/**
 * Prefer a direct mini app link if `TELEGRAM_MINIAPP_SHORT_NAME` is set.
 * This works even if Telegram hasn't enabled the bot's "Main Mini App" flag yet.
 */
export function getTelegramMiniAppDeepLink(matchId?: string): string {
  const botUsername = sanitizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME);
  if (!botUsername) return TELEGRAM_FALLBACK_URL;

  const startParam = buildTelegramMiniAppStartParam(matchId);
  const shortName = sanitizeTelegramMiniAppShortName(process.env.TELEGRAM_MINIAPP_SHORT_NAME);
  if (shortName) {
    return buildTelegramDirectMiniAppLink(botUsername, shortName, startParam);
  }
  return buildTelegramMainMiniAppLink(botUsername, startParam);
}

