import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./discord-token";

type MockRequest = {
  method: string;
  body?: unknown;
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

function createFetchResponse({
  status,
  payload,
}: {
  status: number;
  payload: unknown;
}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      if (payload == null) return "";
      return typeof payload === "string" ? payload : JSON.stringify(payload);
    },
  } as unknown as Response;
}

describe("/api/discord-token", () => {
  const originalEnv = {
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    VITE_DISCORD_CLIENT_ID: process.env.VITE_DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  };

  const originalFetch = (globalThis as any).fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    process.env.DISCORD_CLIENT_ID = originalEnv.DISCORD_CLIENT_ID;
    process.env.VITE_DISCORD_CLIENT_ID = originalEnv.VITE_DISCORD_CLIENT_ID;
    process.env.DISCORD_CLIENT_SECRET = originalEnv.DISCORD_CLIENT_SECRET;
    (globalThis as any).fetch = originalFetch;
  });

  it("rejects non-POST requests", async () => {
    const req: MockRequest = { method: "GET" };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(405);
    expect(res.headers["allow"]).toBe("POST");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("rejects missing code", async () => {
    const req: MockRequest = { method: "POST", body: {} };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "code is required" });
  });

  it("rejects when server OAuth config is missing", async () => {
    process.env.DISCORD_CLIENT_ID = "";
    process.env.VITE_DISCORD_CLIENT_ID = "";
    process.env.DISCORD_CLIENT_SECRET = "";

    const req: MockRequest = { method: "POST", body: { code: "abc" } };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({
      error: "Discord OAuth is not configured on the server.",
    });
  });

  it("exchanges the code for an access token", async () => {
    process.env.DISCORD_CLIENT_ID = "client_id";
    process.env.DISCORD_CLIENT_SECRET = "client_secret";

    fetchMock.mockResolvedValueOnce(
      createFetchResponse({
        status: 200,
        payload: {
          access_token: "token",
          token_type: "Bearer",
          expires_in: 123,
          scope: "identify rpc.activities.write",
        },
      }),
    );

    const req: MockRequest = { method: "POST", body: { code: "the_code" } };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://discord.com/api/oauth2/token");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    expect(init.body).toBeInstanceOf(URLSearchParams);
    const params = init.body as URLSearchParams;
    expect(params.get("client_id")).toBe("client_id");
    expect(params.get("client_secret")).toBe("client_secret");
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("the_code");

    expect(res.jsonBody).toEqual({
      access_token: "token",
      token_type: "Bearer",
      expires_in: 123,
      scope: "identify rpc.activities.write",
    });
  });

  it("surfaces Discord errors when token exchange fails", async () => {
    process.env.DISCORD_CLIENT_ID = "client_id";
    process.env.DISCORD_CLIENT_SECRET = "client_secret";

    fetchMock.mockResolvedValueOnce(
      createFetchResponse({
        status: 400,
        payload: { error_description: "Bad code" },
      }),
    );

    const req: MockRequest = { method: "POST", body: { code: "bad" } };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "Bad code" });
  });

  it("returns a 502 when Discord responds without an access token", async () => {
    process.env.DISCORD_CLIENT_ID = "client_id";
    process.env.DISCORD_CLIENT_SECRET = "client_secret";

    fetchMock.mockResolvedValueOnce(
      createFetchResponse({
        status: 200,
        payload: { token_type: "Bearer" },
      }),
    );

    const req: MockRequest = { method: "POST", body: { code: "the_code" } };
    const res = createMockResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(502);
    expect(res.jsonBody).toEqual({ error: "Discord returned an invalid token response." });
  });
});

