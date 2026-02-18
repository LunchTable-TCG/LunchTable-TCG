import { describe, expect, it } from "vitest";
import { isAllowedOriginForHostMessage, parseHostToGameMessage } from "./iframe";

describe("isAllowedOriginForHostMessage", () => {
  it("accepts known allowed origins regardless of source window", () => {
    expect(isAllowedOriginForHostMessage("http://localhost:3000", false)).toBe(
      true,
    );
    expect(isAllowedOriginForHostMessage("https://milaidy.app", false)).toBe(
      true,
    );
  });

  it("accepts null origin only when message is from the direct parent window", () => {
    expect(isAllowedOriginForHostMessage("null", false)).toBe(false);
    expect(isAllowedOriginForHostMessage("null", true)).toBe(true);
  });

  it("accepts file:// origin only when message is from the direct parent window", () => {
    expect(isAllowedOriginForHostMessage("file://", false)).toBe(false);
    expect(isAllowedOriginForHostMessage("file://", true)).toBe(true);
    expect(isAllowedOriginForHostMessage("file://some/path", false)).toBe(false);
    expect(isAllowedOriginForHostMessage("file://some/path", true)).toBe(true);
  });

  it("rejects unknown origins", () => {
    expect(isAllowedOriginForHostMessage("https://evil.example", true)).toBe(
      false,
    );
  });
});

describe("parseHostToGameMessage", () => {
  it("returns null for non-object payloads", () => {
    expect(parseHostToGameMessage(null)).toBeNull();
    expect(parseHostToGameMessage("LTCG_AUTH")).toBeNull();
    expect(parseHostToGameMessage(123)).toBeNull();
  });

  it("parses LTCG_AUTH and AUTH_TOKEN with trimming and optional agentId", () => {
    expect(
      parseHostToGameMessage({
        type: "LTCG_AUTH",
        authToken: "  ltcg_token  ",
        agentId: "  agent_123  ",
      }),
    ).toEqual({
      type: "LTCG_AUTH",
      authToken: "ltcg_token",
      agentId: "agent_123",
    });

    expect(
      parseHostToGameMessage({
        type: "AUTH_TOKEN",
        authToken: "ltcg_token",
        agentId: "   ",
      }),
    ).toEqual({
      type: "AUTH_TOKEN",
      authToken: "ltcg_token",
      agentId: undefined,
    });

    expect(
      parseHostToGameMessage({
        type: "LTCG_AUTH",
        authToken: "   ",
      }),
    ).toBeNull();
  });

  it("parses START_MATCH with strict mode validation", () => {
    expect(parseHostToGameMessage({ type: "START_MATCH", mode: "story" })).toEqual(
      { type: "START_MATCH", mode: "story" },
    );
    expect(parseHostToGameMessage({ type: "START_MATCH", mode: "pvp" })).toEqual(
      { type: "START_MATCH", mode: "pvp" },
    );
    expect(parseHostToGameMessage({ type: "START_MATCH", mode: "duel" })).toBeNull();
  });

  it("parses wallet and control messages and rejects invalid payloads", () => {
    expect(
      parseHostToGameMessage({
        type: "WALLET_CONNECTED",
        address: "  0xabc  ",
        chain: "  base  ",
      }),
    ).toEqual({
      type: "WALLET_CONNECTED",
      address: "0xabc",
      chain: "base",
    });

    expect(
      parseHostToGameMessage({
        type: "WALLET_CONNECTED",
        address: "",
        chain: "base",
      }),
    ).toBeNull();

    expect(parseHostToGameMessage({ type: "SKIP_CUTSCENE" })).toEqual({
      type: "SKIP_CUTSCENE",
    });
    expect(parseHostToGameMessage({ type: "PAUSE_AUTONOMY" })).toEqual({
      type: "PAUSE_AUTONOMY",
    });
    expect(parseHostToGameMessage({ type: "RESUME_AUTONOMY" })).toEqual({
      type: "RESUME_AUTONOMY",
    });
    expect(parseHostToGameMessage({ type: "STOP_MATCH" })).toEqual({
      type: "STOP_MATCH",
    });
  });
});

