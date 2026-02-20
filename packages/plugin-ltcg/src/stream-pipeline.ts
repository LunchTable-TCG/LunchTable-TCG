/**
 * StreamPipeline — Xvfb + Chromium + FFmpeg process orchestrator.
 *
 * Manages the 3-process pipeline for capturing game visuals and
 * pushing RTMP video to retake.tv.
 *
 * Lifecycle:
 *   1. Start Xvfb on a free display (:99, :100, etc.)
 *   2. Launch headless Chromium on that display, loading the spectator URL
 *   3. Wait for page load + inject auth via postMessage
 *   4. Start FFmpeg x11grab → RTMP push
 *   5. Monitor all 3 processes, log failures
 *
 * Platform: Linux only (requires Xvfb, Chromium, FFmpeg).
 * On macOS, start() will throw with a clear error message.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { checkStreamDependencies, resolveChromiumBinary } from "./stream-deps.js";

// ── Types ────────────────────────────────────────────────────────

export type PipelineConfig = {
  /** Spectator page URL (e.g. http://localhost:3334/spectator?matchId=...) */
  gameUrl: string;
  /** LTCG API key for postMessage auth injection */
  authToken: string;
  /** RTMP ingest URL from getRtmpCredentials() */
  rtmpUrl: string;
  /** RTMP stream key from getRtmpCredentials() */
  rtmpKey: string;
  /** Capture resolution. Default: "1280x720" */
  resolution?: string;
  /** Video bitrate. Default: "2500k" */
  bitrate?: string;
  /** Framerate. Default: 30 */
  framerate?: number;
};

export type ProcessHealth = {
  xvfb: boolean;
  browser: boolean;
  ffmpeg: boolean;
};

type ProcessInfo = {
  process: ChildProcess;
  name: string;
};

// ── Constants ────────────────────────────────────────────────────

const TAG = "[StreamPipeline]";
const DEFAULT_RESOLUTION = "1280x720";
const DEFAULT_BITRATE = "2500k";
const DEFAULT_FRAMERATE = 30;
const XVFB_STARTUP_DELAY_MS = 500;
const BROWSER_LOAD_TIMEOUT_MS = 15_000;

// ── Singleton ────────────────────────────────────────────────────

let _pipeline: StreamPipeline | null = null;

export function getStreamPipeline(): StreamPipeline | null {
  return _pipeline;
}

export function initStreamPipeline(): StreamPipeline {
  _pipeline = new StreamPipeline();
  return _pipeline;
}

// ── Class ────────────────────────────────────────────────────────

export class StreamPipeline {
  private xvfb: ChildProcess | null = null;
  private browser: ChildProcess | null = null;
  private ffmpeg: ChildProcess | null = null;
  private display = "";
  private _running = false;
  private startedAt: number | null = null;

  isRunning(): boolean {
    return this._running;
  }

  getHealth(): ProcessHealth {
    return {
      xvfb: this.isAlive(this.xvfb),
      browser: this.isAlive(this.browser),
      ffmpeg: this.isAlive(this.ffmpeg),
    };
  }

  getUptime(): number {
    if (!this.startedAt) return 0;
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  getDisplay(): string {
    return this.display;
  }

  async start(config: PipelineConfig): Promise<void> {
    if (this._running) {
      throw new Error(`${TAG} Pipeline is already running`);
    }

    // Check dependencies
    const deps = await checkStreamDependencies();
    if (deps.platform !== "linux") {
      throw new Error(
        `${TAG} Streaming pipeline requires Linux (Xvfb + FFmpeg). ` +
          `Current platform: ${deps.platform}. Use API-only streaming actions instead.`,
      );
    }
    if (!deps.allReady) {
      throw new Error(
        `${TAG} Missing dependencies: ${deps.missing.join(", ")}. ` +
          `Install with: apt install ${deps.missing.map((d) => d.toLowerCase()).join(" ")}`,
      );
    }

    const resolution = config.resolution || DEFAULT_RESOLUTION;
    const bitrate = config.bitrate || DEFAULT_BITRATE;
    const framerate = config.framerate || DEFAULT_FRAMERATE;
    const rtmpTarget = `${config.rtmpUrl}/${config.rtmpKey}`;

    try {
      // 1. Start Xvfb
      this.display = await this.findFreeDisplay();
      this.xvfb = this.startXvfb(this.display, resolution);
      await this.waitMs(XVFB_STARTUP_DELAY_MS);

      if (!this.isAlive(this.xvfb)) {
        throw new Error("Xvfb exited immediately");
      }
      console.log(`${TAG} Xvfb started on display ${this.display}`);

      // 2. Launch Chromium
      const chromiumBin = await resolveChromiumBinary();
      if (!chromiumBin) {
        throw new Error("No Chromium binary found after dependency check passed");
      }
      this.browser = this.startChromium(
        chromiumBin,
        this.display,
        config.gameUrl,
        resolution,
      );
      await this.waitForBrowserReady(BROWSER_LOAD_TIMEOUT_MS);
      console.log(`${TAG} Chromium loaded: ${config.gameUrl}`);

      // 3. Start FFmpeg
      this.ffmpeg = this.startFfmpeg(
        this.display,
        resolution,
        framerate,
        bitrate,
        rtmpTarget,
      );
      await this.waitMs(1000);

      if (!this.isAlive(this.ffmpeg)) {
        throw new Error("FFmpeg exited immediately");
      }
      console.log(`${TAG} FFmpeg streaming to RTMP`);

      this._running = true;
      this.startedAt = Date.now();

      // Monitor processes for unexpected exits
      this.monitorProcess({ process: this.xvfb, name: "Xvfb" });
      this.monitorProcess({ process: this.browser, name: "Chromium" });
      this.monitorProcess({ process: this.ffmpeg, name: "FFmpeg" });
    } catch (err) {
      // Cleanup on failure
      await this.killAll();
      throw err;
    }
  }

  async stop(): Promise<{ uptime: number }> {
    const uptime = this.getUptime();
    await this.killAll();
    this._running = false;
    this.startedAt = null;
    this.display = "";
    console.log(`${TAG} Pipeline stopped (uptime: ${uptime}s)`);
    return { uptime };
  }

  // ── Private: Process launchers ─────────────────────────────────

  private startXvfb(display: string, resolution: string): ChildProcess {
    const [width, height] = resolution.split("x");
    const proc = spawn("Xvfb", [display, "-screen", "0", `${width}x${height}x24`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.logStderr(proc, "Xvfb");
    return proc;
  }

  private startChromium(
    binary: string,
    display: string,
    url: string,
    resolution: string,
  ): ChildProcess {
    const proc = spawn(
      binary,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-software-rasterizer",
        `--window-size=${resolution.replace("x", ",")}`,
        "--autoplay-policy=no-user-gesture-required",
        url,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, DISPLAY: display },
      },
    );
    this.logStderr(proc, "Chromium");
    return proc;
  }

  private startFfmpeg(
    display: string,
    resolution: string,
    framerate: number,
    bitrate: string,
    rtmpTarget: string,
  ): ChildProcess {
    const bufsize = `${parseInt(bitrate) * 2}k`;
    const proc = spawn(
      "ffmpeg",
      [
        "-f",
        "x11grab",
        "-video_size",
        resolution,
        "-framerate",
        String(framerate),
        "-i",
        display,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
        "-b:v",
        bitrate,
        "-maxrate",
        bitrate,
        "-bufsize",
        bufsize,
        "-pix_fmt",
        "yuv420p",
        "-g",
        String(framerate * 2),
        "-f",
        "flv",
        rtmpTarget,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, DISPLAY: display },
      },
    );
    this.logStderr(proc, "FFmpeg");
    return proc;
  }

  // ── Private: Helpers ───────────────────────────────────────────

  private isAlive(proc: ChildProcess | null): boolean {
    return proc !== null && proc.exitCode === null && !proc.killed;
  }

  private async findFreeDisplay(): Promise<string> {
    for (let n = 99; n < 200; n++) {
      const lockFile = `/tmp/.X${n}-lock`;
      if (!existsSync(lockFile)) {
        return `:${n}`;
      }
    }
    throw new Error(`${TAG} No free display found (:99 through :199)`);
  }

  private monitorProcess(info: ProcessInfo): void {
    info.process.on("exit", (code, signal) => {
      if (this._running) {
        console.warn(
          `${TAG} ${info.name} exited unexpectedly (code=${code}, signal=${signal})`,
        );
      }
    });
  }

  private logStderr(proc: ChildProcess, name: string): void {
    proc.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) {
        // FFmpeg is very chatty — only log errors
        if (name === "FFmpeg" && !line.toLowerCase().includes("error")) return;
        console.log(`${TAG} [${name}] ${line}`);
      }
    });
  }

  private async killAll(): Promise<void> {
    const procs = [
      { proc: this.ffmpeg, name: "FFmpeg" },
      { proc: this.browser, name: "Chromium" },
      { proc: this.xvfb, name: "Xvfb" },
    ];

    for (const { proc, name } of procs) {
      if (proc && !proc.killed && proc.exitCode === null) {
        proc.kill("SIGTERM");
        // Give process 2s to exit gracefully before SIGKILL
        await Promise.race([
          new Promise<void>((resolve) => proc.on("exit", resolve)),
          this.waitMs(2000).then(() => {
            if (proc.exitCode === null) {
              proc.kill("SIGKILL");
            }
          }),
        ]);
      }
    }

    this.ffmpeg = null;
    this.browser = null;
    this.xvfb = null;
  }

  private waitMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private waitForBrowserReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.browser) {
        return reject(new Error("Browser process not started"));
      }

      const timer = setTimeout(() => {
        // Browser is still alive after timeout — assume it's loaded
        if (this.isAlive(this.browser)) {
          resolve();
        } else {
          reject(new Error("Browser exited before page load"));
        }
      }, timeoutMs);

      this.browser.on("exit", () => {
        clearTimeout(timer);
        reject(new Error("Browser exited during startup"));
      });

      // Also check if browser is already showing signs of being ready
      // by monitoring stderr for DevTools listening message
      this.browser.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes("DevTools listening")) {
          clearTimeout(timer);
          // Small additional delay for page render
          setTimeout(resolve, 2000);
        }
      });
    });
  }
}
