import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import handler from "./interactions";

type MockRequest = {
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>;
};

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  jsonBody: unknown;
  setHeader: (key: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    jsonBody: null,
    setHeader(key, value) {
      res.headers[key.toLowerCase()] = String(value);
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.jsonBody = payload;
      return res;
    },
  };
  return res;
}

function createSignedHeaders({
  timestamp,
  body,
  privateKey,
}: {
  timestamp: string;
  body: string;
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
}) {
  const signature = sign(null, Buffer.from(`${timestamp}${body}`), privateKey);
  return {
    "x-signature-ed25519": signature.toString("hex"),
    "x-signature-timestamp": timestamp,
  };
}

describe("/api/interactions", () => {
  it("responds to PING with PONG when signature is valid (string body)", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spkiDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const publicKeyHex = spkiDer.subarray(spkiDer.length - 32).toString("hex");
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const body = JSON.stringify({ type: 1 });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = createSignedHeaders({ timestamp, body, privateKey });

    const req: MockRequest = { method: "POST", headers, body };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ type: 1 });
  });

  it("responds to PING with PONG when signature is valid (object body fallback)", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spkiDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const publicKeyHex = spkiDer.subarray(spkiDer.length - 32).toString("hex");
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const payload = { type: 1 };
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = createSignedHeaders({ timestamp, body, privateKey });

    const req: MockRequest = {
      method: "POST",
      headers,
      body: payload,
      [Symbol.asyncIterator]: async function* () {
        // Simulate a runtime that pre-parsed JSON and consumed the stream.
      },
    };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ type: 1 });
  });

  it("rejects requests with an invalid signature", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const spkiDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const publicKeyHex = spkiDer.subarray(spkiDer.length - 32).toString("hex");
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const req: MockRequest = {
      method: "POST",
      headers: {
        "x-signature-ed25519": "00".repeat(64),
        "x-signature-timestamp": String(Math.floor(Date.now() / 1000)),
      },
      body: JSON.stringify({ type: 1 }),
    };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
  });

  it("rejects requests with a timestamp older than 5 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-18T12:00:00Z"));

    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spkiDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const publicKeyHex = spkiDer.subarray(spkiDer.length - 32).toString("hex");
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const body = JSON.stringify({ type: 1 });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const timestamp = String(nowSeconds - 5 * 60 - 1);
    const headers = createSignedHeaders({ timestamp, body, privateKey });

    const req: MockRequest = { method: "POST", headers, body };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);

    vi.useRealTimers();
  });
});

