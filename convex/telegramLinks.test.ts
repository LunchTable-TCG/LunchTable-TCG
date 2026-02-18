import { describe, expect, it, afterEach } from "vitest";
import {
  TELEGRAM_FALLBACK_URL,
  getTelegramMiniAppDeepLink,
  sanitizeTelegramBotUsername,
  sanitizeTelegramMiniAppShortName,
} from "./telegramLinks";

const ORIGINAL_ENV = {
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  TELEGRAM_MINIAPP_SHORT_NAME: process.env.TELEGRAM_MINIAPP_SHORT_NAME,
};

afterEach(() => {
  process.env.TELEGRAM_BOT_USERNAME = ORIGINAL_ENV.TELEGRAM_BOT_USERNAME;
  process.env.TELEGRAM_MINIAPP_SHORT_NAME = ORIGINAL_ENV.TELEGRAM_MINIAPP_SHORT_NAME;
});

describe("telegramLinks", () => {
  it("falls back when TELEGRAM_BOT_USERNAME is missing", () => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_MINIAPP_SHORT_NAME;

    expect(getTelegramMiniAppDeepLink("abc123")).toBe(TELEGRAM_FALLBACK_URL);
  });

  it("builds main mini app links when short name is not set", () => {
    process.env.TELEGRAM_BOT_USERNAME = "LunchLady_bot";
    delete process.env.TELEGRAM_MINIAPP_SHORT_NAME;

    expect(getTelegramMiniAppDeepLink("match_1")).toBe(
      "https://t.me/LunchLady_bot?startapp=m_match_1",
    );
  });

  it("builds direct mini app links when TELEGRAM_MINIAPP_SHORT_NAME is set", () => {
    process.env.TELEGRAM_BOT_USERNAME = "LunchLady_bot";
    process.env.TELEGRAM_MINIAPP_SHORT_NAME = "lunchtable";

    expect(getTelegramMiniAppDeepLink("match_1")).toBe(
      "https://t.me/LunchLady_bot/lunchtable?startapp=m_match_1",
    );
  });

  it("sanitizes bot usernames", () => {
    expect(sanitizeTelegramBotUsername("@LunchLady_bot")).toBe("LunchLady_bot");
    expect(sanitizeTelegramBotUsername("LunchLady_bot")).toBe("LunchLady_bot");
    expect(sanitizeTelegramBotUsername("bad-username")).toBe(null);
  });

  it("sanitizes mini app short names", () => {
    expect(sanitizeTelegramMiniAppShortName("lunchtable")).toBe("lunchtable");
    expect(sanitizeTelegramMiniAppShortName("bad-name")).toBe(null);
    expect(sanitizeTelegramMiniAppShortName("")).toBe(null);
  });
});

