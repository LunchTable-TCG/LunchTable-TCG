import { describe, expect, it } from "vitest";
import { deriveIframeEmbedFlags } from "./useIframeMode";

describe("deriveIframeEmbedFlags", () => {
  it("treats ?embedded=true as embedded even when not in an iframe", () => {
    expect(
      deriveIframeEmbedFlags({
        isInIframe: false,
        hasEmbedParam: true,
        isDiscordActivity: false,
      }).isEmbedded,
    ).toBe(true);
  });

  it("treats non-Discord iframes as embedded (milaidy)", () => {
    expect(
      deriveIframeEmbedFlags({
        isInIframe: true,
        hasEmbedParam: false,
        isDiscordActivity: false,
      }).isEmbedded,
    ).toBe(true);
  });

  it("does not treat Discord Activities as embedded for milaidy host messaging", () => {
    expect(
      deriveIframeEmbedFlags({
        isInIframe: true,
        hasEmbedParam: false,
        isDiscordActivity: true,
      }).isEmbedded,
    ).toBe(false);
  });
});

