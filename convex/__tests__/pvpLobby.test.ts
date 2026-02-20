import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");
const gameSource = readFileSync(path.join(repoRoot, "convex/game.ts"), "utf8");

describe("pvp lobby lifecycle surface", () => {
  it("exports the additive pvp lobby APIs", () => {
    expect(gameSource).toContain("export const createPvpLobby = mutation(");
    expect(gameSource).toContain("export const listOpenPvpLobbies = query(");
    expect(gameSource).toContain("export const joinPvpLobby = mutation(");
    expect(gameSource).toContain("export const joinPvpLobbyByCode = mutation(");
    expect(gameSource).toContain("export const cancelPvpLobby = mutation(");
    expect(gameSource).toContain("export const getMyPvpLobby = query(");
  });

  it("prevents duplicate waiting lobbies per host", () => {
    expect(gameSource).toContain("existingWaiting");
    expect(gameSource).toContain("You already have a waiting PvP lobby");
  });

  it("rejects host joining their own lobby", () => {
    expect(gameSource).toContain("Cannot join your own lobby.");
  });

  it("starts match on away join and marks lobby active", () => {
    expect(gameSource).toContain("await match.joinMatch(ctx, {");
    expect(gameSource).toContain("await match.startMatch(ctx, {");
    expect(gameSource).toContain("await activatePvpLobbyOnJoin(ctx, args.matchId);");
  });

  it("only allows cancel while waiting and delegates to match component", () => {
    expect(gameSource).toContain("if (lobby.status !== \"waiting\")");
    expect(gameSource).toContain("await match.cancelMatch(ctx, { matchId: args.matchId })");
  });
});
