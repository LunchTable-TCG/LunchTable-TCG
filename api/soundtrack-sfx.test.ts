import { describe, expect, it } from "vitest";
import handler from "./soundtrack-sfx";

type MockResponse = {
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  send: (payload: unknown) => MockResponse;
  end: () => MockResponse;
};

type MockRequest = {
  method: string;
  query: Record<string, unknown>;
};

function createMockResponse(): MockResponse {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe("soundtrack-sfx handler", () => {
  it("serves WAV audio for GET requests", async () => {
    const response = createMockResponse();
    const request: MockRequest = {
      method: "GET",
      query: { name: "victory" },
    };

    await handler(
      request as unknown as Parameters<typeof handler>[0],
      response as unknown as Parameters<typeof handler>[1],
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toBe("audio/wav");
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(Buffer.isBuffer(response.body)).toBe(true);

    const buffer = response.body as Buffer;
    expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("returns 405 for unsupported methods", async () => {
    const response = createMockResponse();
    const request: MockRequest = {
      method: "POST",
      query: {},
    };

    await handler(
      request as unknown as Parameters<typeof handler>[0],
      response as unknown as Parameters<typeof handler>[1],
    );

    expect(response.statusCode).toBe(405);
    expect(response.body).toEqual({ error: "Method not allowed" });
  });

  it("responds to CORS preflight OPTIONS requests", async () => {
    const response = createMockResponse();
    const request: MockRequest = {
      method: "OPTIONS",
      query: {},
    };

    await handler(
      request as unknown as Parameters<typeof handler>[0],
      response as unknown as Parameters<typeof handler>[1],
    );

    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
  });
});
