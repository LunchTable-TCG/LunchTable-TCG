import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { initRetakeClient, getRetakeClient } from "../retake-client.js";
import { startPipelineAction } from "../actions/retake/startPipeline.js";
import { stopPipelineAction } from "../actions/retake/stopPipeline.js";
import type { IAgentRuntime, Memory } from "../types.js";

// ── Mock child_process + fs ─────────────────────────────────────

vi.mock("node:child_process", () => {
  const createMockProcess = () => {
    const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    return {
      exitCode: null,
      killed: false,
      pid: Math.floor(Math.random() * 10000),
      kill: vi.fn(function (this: { killed: boolean }) {
        this.killed = true;
        // Fire exit handler
        handlers["exit"]?.forEach((fn) => fn(0, "SIGTERM"));
      }),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        handlers[event] = handlers[event] || [];
        handlers[event].push(fn);
      }),
      stderr: {
        on: vi.fn(),
      },
      stdout: {
        on: vi.fn(),
      },
    };
  };

  return {
    spawn: vi.fn(() => createMockProcess()),
    execFile: vi.fn(
      (
        _cmd: string,
        _args: string[],
        cb: (err: Error | null, result: { stdout: string }) => void,
      ) => {
        cb(null, { stdout: "/usr/bin/test" });
      },
    ),
  };
});

vi.mock("node:util", () => ({
  promisify: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false), // No X lock files
}));

// ── Mock stream-deps for controlled testing ─────────────────────

vi.mock("../stream-deps.js", () => ({
  checkStreamDependencies: vi.fn(async () => ({
    xvfb: true,
    chromium: true,
    ffmpeg: true,
    allReady: true,
    missing: [],
    platform: "linux" as const,
  })),
  resolveChromiumBinary: vi.fn(async () => "chromium"),
}));

// We need to mock process.platform for the StreamPipeline
const originalPlatform = process.platform;

// ── Helpers ──────────────────────────────────────────────────────

function createRuntime(settings?: Record<string, string>): IAgentRuntime {
  return {
    agentId: "agent_test",
    getSetting: (key: string) => settings?.[key],
    getService: () => null,
    registerEvent: () => {},
    emitEvent: async () => {},
  };
}

function createMessage(text = ""): Memory {
  return { content: { text } };
}

// ── StreamDependencies tests ────────────────────────────────────

describe("checkStreamDependencies", () => {
  it("reports all deps available on linux", async () => {
    const { checkStreamDependencies } = await import("../stream-deps.js");
    const deps = await checkStreamDependencies();
    expect(deps.allReady).toBe(true);
    expect(deps.missing).toEqual([]);
  });
});

// ── StreamPipeline unit tests ───────────────────────────────────

describe("StreamPipeline", () => {
  let StreamPipeline: typeof import("../stream-pipeline.js").StreamPipeline;
  let initStreamPipeline: typeof import("../stream-pipeline.js").initStreamPipeline;
  let getStreamPipeline: typeof import("../stream-pipeline.js").getStreamPipeline;

  beforeEach(async () => {
    vi.resetModules();
    // Re-import to get fresh singleton state
    const mod = await import("../stream-pipeline.js");
    StreamPipeline = mod.StreamPipeline;
    initStreamPipeline = mod.initStreamPipeline;
    getStreamPipeline = mod.getStreamPipeline;
  });

  it("initializes with isRunning() = false", () => {
    const pipeline = new StreamPipeline();
    expect(pipeline.isRunning()).toBe(false);
  });

  it("getHealth() shows all false when not started", () => {
    const pipeline = new StreamPipeline();
    const health = pipeline.getHealth();
    expect(health).toEqual({ xvfb: false, browser: false, ffmpeg: false });
  });

  it("getUptime() is 0 when not started", () => {
    const pipeline = new StreamPipeline();
    expect(pipeline.getUptime()).toBe(0);
  });

  it("singleton init/get pattern works", () => {
    const pipeline = initStreamPipeline();
    expect(getStreamPipeline()).toBe(pipeline);
  });
});

// ── Pipeline action validate() tests ────────────────────────────

describe("startPipelineAction validate", () => {
  const runtime = createRuntime();
  const message = createMessage();

  it("returns false when no retake client", async () => {
    // Init with no token
    initRetakeClient("https://retake.tv/api/v1", "");
    expect(await startPipelineAction.validate(runtime, message)).toBe(false);
  });

  it("returns true when client has token and deps available", async () => {
    initRetakeClient("https://retake.tv/api/v1", "rtk_test");
    expect(await startPipelineAction.validate(runtime, message)).toBe(true);
  });
});

describe("stopPipelineAction validate", () => {
  const runtime = createRuntime();
  const message = createMessage();

  it("returns false when no retake client", async () => {
    initRetakeClient("https://retake.tv/api/v1", "");
    expect(await stopPipelineAction.validate(runtime, message)).toBe(false);
  });

  it("returns false when pipeline is not running", async () => {
    initRetakeClient("https://retake.tv/api/v1", "rtk_test");
    expect(await stopPipelineAction.validate(runtime, message)).toBe(false);
  });
});

// ── Pipeline action handler tests ───────────────────────────────

describe("startPipelineAction handler", () => {
  it("fails when retake client has no token", async () => {
    initRetakeClient("https://retake.tv/api/v1", "");
    const callback = vi.fn().mockResolvedValue([]);

    const result = (await startPipelineAction.handler(
      createRuntime(),
      createMessage("start pipeline"),
      undefined,
      undefined,
      callback,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("fails when RETAKE_GAME_URL is not set", async () => {
    initRetakeClient("https://retake.tv/api/v1", "rtk_test");
    const callback = vi.fn().mockResolvedValue([]);

    // Clear any env values
    const original = process.env.RETAKE_GAME_URL;
    delete process.env.RETAKE_GAME_URL;
    delete process.env.LTCG_WEB_URL;

    const result = (await startPipelineAction.handler(
      createRuntime({}), // No settings
      createMessage("start pipeline"),
      undefined,
      undefined,
      callback,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("RETAKE_GAME_URL");

    // Restore
    if (original) process.env.RETAKE_GAME_URL = original;
  });
});

describe("stopPipelineAction handler", () => {
  it("fails when retake client has no token", async () => {
    initRetakeClient("https://retake.tv/api/v1", "");
    const callback = vi.fn().mockResolvedValue([]);

    const result = (await stopPipelineAction.handler(
      createRuntime(),
      createMessage("stop pipeline"),
      undefined,
      undefined,
      callback,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("fails when pipeline is not running", async () => {
    initRetakeClient("https://retake.tv/api/v1", "rtk_test");
    const callback = vi.fn().mockResolvedValue([]);

    const result = (await stopPipelineAction.handler(
      createRuntime(),
      createMessage("stop pipeline"),
      undefined,
      undefined,
      callback,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not running");
  });
});

// ── Updated startStream/stopStream backward compatibility ───────
// These tests verify the existing API-only actions still work
// after pipeline integration was added. Tests are in retake.test.ts
// (the original test file) for deeper coverage. Here we just confirm
// the handler signature and basic behavior is unchanged.

describe("startRetakeStreamAction backward compat", () => {
  it("validates true when client has token", async () => {
    // Use dynamic imports to match the module cache after vi.resetModules()
    const { initRetakeClient: init } = await import("../retake-client.js");
    const { startRetakeStreamAction } = await import(
      "../actions/retake/startStream.js"
    );
    init("https://retake.tv/api/v1", "rtk_test");
    const result = await startRetakeStreamAction.validate(
      createRuntime(),
      createMessage(),
    );
    expect(result).toBe(true);
  });

  it("validates false when client has no token", async () => {
    const { initRetakeClient: init } = await import("../retake-client.js");
    const { startRetakeStreamAction } = await import(
      "../actions/retake/startStream.js"
    );
    init("https://retake.tv/api/v1", "");
    const result = await startRetakeStreamAction.validate(
      createRuntime(),
      createMessage(),
    );
    expect(result).toBe(false);
  });
});

describe("stopRetakeStreamAction backward compat", () => {
  it("validates true when client has token", async () => {
    const { initRetakeClient: init } = await import("../retake-client.js");
    const { stopRetakeStreamAction } = await import(
      "../actions/retake/stopStream.js"
    );
    init("https://retake.tv/api/v1", "rtk_test");
    const result = await stopRetakeStreamAction.validate(
      createRuntime(),
      createMessage(),
    );
    expect(result).toBe(true);
  });

  it("handler fails gracefully without token", async () => {
    const { initRetakeClient: init } = await import("../retake-client.js");
    const { stopRetakeStreamAction } = await import(
      "../actions/retake/stopStream.js"
    );
    init("https://retake.tv/api/v1", "");
    const callback = vi.fn().mockResolvedValue([]);

    const result = (await stopRetakeStreamAction.handler(
      createRuntime(),
      createMessage("stop stream"),
      undefined,
      undefined,
      callback,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
  });
});
