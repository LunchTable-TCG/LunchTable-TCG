/**
 * Streaming pipeline dependency checker.
 *
 * Checks for Xvfb, Chromium, and FFmpeg in PATH.
 * Called during plugin init to log streaming capability status.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type StreamDependencies = {
  xvfb: boolean;
  chromium: boolean;
  ffmpeg: boolean;
  allReady: boolean;
  missing: string[];
  platform: "linux" | "darwin" | "other";
};

/** Try to find a binary by running `which <name>`. */
async function binaryExists(name: string): Promise<boolean> {
  try {
    await execFileAsync("which", [name]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if all streaming pipeline dependencies are available.
 *
 * On macOS (darwin), Xvfb is not expected — the pipeline only runs on Linux.
 * The checker still reports missing deps so callers can decide how to proceed.
 */
export async function checkStreamDependencies(): Promise<StreamDependencies> {
  const platform =
    process.platform === "linux"
      ? ("linux" as const)
      : process.platform === "darwin"
        ? ("darwin" as const)
        : ("other" as const);

  const [xvfb, chromium, chromiumBrowser, googleChrome, ffmpeg] =
    await Promise.all([
      binaryExists("Xvfb"),
      binaryExists("chromium"),
      binaryExists("chromium-browser"),
      binaryExists("google-chrome"),
      binaryExists("ffmpeg"),
    ]);

  const hasChromium = chromium || chromiumBrowser || googleChrome;

  const missing: string[] = [];
  if (!xvfb) missing.push("Xvfb");
  if (!hasChromium) missing.push("chromium");
  if (!ffmpeg) missing.push("ffmpeg");

  return {
    xvfb,
    chromium: hasChromium,
    ffmpeg,
    allReady: missing.length === 0,
    missing,
    platform,
  };
}

/** Resolve the Chromium binary name available on the system. */
export async function resolveChromiumBinary(): Promise<string | null> {
  for (const name of [
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
  ]) {
    if (await binaryExists(name)) return name;
  }
  return null;
}
