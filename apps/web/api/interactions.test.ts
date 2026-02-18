import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler, {
  getInteractionCommandName,
  verifyDiscordRequestSignature,
} from "./interactions";

function deriveDiscordPublicKeyHex() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const publicKeyHex = spki.subarray(-32).toString("hex");
  return { publicKeyHex, privateKey };
}

function signPayload(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], timestamp: string, body: string) {
  return sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString("hex");
}

function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    jsonBody: null as unknown,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
  };

  return response as unknown as VercelResponse & {
    statusCode: number;
    headers: Record<string, string>;
    jsonBody: unknown;
  };
}

describe("interactions api", () => {
  it("verifies valid Discord signatures", () => {
    const { publicKeyHex, privateKey } = deriveDiscordPublicKeyHex();
    const body = JSON.stringify({ type: 1 });
    const timestamp = "1730000000";
    const signatureHex = signPayload(privateKey, timestamp, body);

    expect(
      verifyDiscordRequestSignature({
        publicKeyHex,
        signatureHex,
        timestamp,
        body,
      }),
    ).toBe(true);
  });

  it("extracts command names when present", () => {
    expect(getInteractionCommandName({ data: { name: "play" } })).toBe("play");
    expect(getInteractionCommandName({ data: { name: "  " } })).toBeNull();
    expect(getInteractionCommandName(null)).toBeNull();
  });

  it("rejects unsigned requests", async () => {
    const { publicKeyHex } = deriveDiscordPublicKeyHex();
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const request = {
      method: "POST",
      headers: {},
      body: JSON.stringify({ type: 1 }),
    } as unknown as VercelRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(401);
    expect(response.jsonBody).toEqual({ error: "Invalid request signature." });
  });

  it("responds to Discord ping with pong", async () => {
    const { publicKeyHex, privateKey } = deriveDiscordPublicKeyHex();
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const body = JSON.stringify({ type: 1 });
    const timestamp = "1730000001";
    const signatureHex = signPayload(privateKey, timestamp, body);

    const request = {
      method: "POST",
      headers: {
        "x-signature-ed25519": signatureHex,
        "x-signature-timestamp": timestamp,
      },
      body,
    } as unknown as VercelRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toEqual({ type: 1 });
  });
});
