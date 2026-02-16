import { readFile } from "node:fs/promises";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type ParsedManifest = {
  playlists: Record<string, string[]>;
  sfx: Record<string, string>;
};

function parseSoundtrackIn(raw: string): ParsedManifest {
  const playlists: Record<string, string[]> = { default: [] };
  const sfx: Record<string, string> = {};

  let section = "default";
  const lines = raw.split(/\r?\n/);

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith(";") || line.startsWith("//")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      const nextSection = line.slice(1, -1).trim().toLowerCase();
      if (!nextSection) continue;
      section = nextSection;
      if (section !== "sfx" && !playlists[section]) playlists[section] = [];
      continue;
    }

    if (section === "sfx" || section.startsWith("sfx:")) {
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim().toLowerCase();
      const value = line.slice(eqIndex + 1).trim();
      if (!key || !value) continue;
      sfx[key] = value;
      continue;
    }

    const eqIndex = line.indexOf("=");
    const value = (eqIndex === -1 ? line : line.slice(eqIndex + 1)).trim();
    if (!value) continue;

    if (!playlists[section]) playlists[section] = [];
    if (!playlists[section]!.includes(value)) playlists[section]!.push(value);
  }

  return { playlists, sfx };
}

function withAbsoluteUrl(input: string, baseUrl: string): string {
  try {
    return new URL(input, baseUrl).toString();
  } catch {
    return input;
  }
}

function getBaseUrl(request: VercelRequest): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(",")[0];
  const host = request.headers.host ?? "localhost:3334";
  return `${protocol || "https"}://${host}`;
}

function resolveContext(playlists: Record<string, string[]>, context: string) {
  const normalized = context.trim().toLowerCase();
  const keysTried = [`page:${normalized}`, normalized, "default", "app", "global"];

  for (const key of keysTried) {
    const tracks = playlists[key];
    if (tracks && tracks.length > 0) {
      return {
        context: normalized,
        key,
        tracks,
        shuffle: normalized === "landing",
      };
    }
  }

  return {
    context: normalized,
    key: null,
    tracks: [] as string[],
    shuffle: normalized === "landing",
  };
}

function setCorsHeaders(request: VercelRequest, response: VercelResponse) {
  const origin = request.headers.origin;
  const allowedOrigin = typeof origin === "string" && origin.length > 0 ? origin : "*";

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
}

async function readManifestFile(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "public", "soundtrack.in"),
    path.join(process.cwd(), "apps", "web", "public", "soundtrack.in"),
  ];

  for (const filePath of candidates) {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      // try next candidate path
    }
  }

  throw new Error("soundtrack.in not found");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const raw = await readManifestFile();
    const parsed = parseSoundtrackIn(raw);
    const baseUrl = getBaseUrl(req);

    const playlists = Object.fromEntries(
      Object.entries(parsed.playlists).map(([key, tracks]) => [
        key,
        tracks.map((track) => withAbsoluteUrl(track, baseUrl)),
      ]),
    );

    const sfx = Object.fromEntries(
      Object.entries(parsed.sfx).map(([key, value]) => [key, withAbsoluteUrl(value, baseUrl)]),
    );

    const context =
      typeof req.query.context === "string" ? req.query.context : null;
    const resolved = context ? resolveContext(playlists, context) : null;

    res.status(200).json({
      source: `${baseUrl}/soundtrack.in`,
      playlists,
      sfx,
      resolved,
      generatedAt: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load soundtrack";
    res.status(500).json({ error: message });
  }
}
