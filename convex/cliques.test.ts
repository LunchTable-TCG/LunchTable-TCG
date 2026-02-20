import { describe, it, expect } from "vitest";

// ── Extract pure functions for testing ──────────────────────────────
// These are internal to cliques.ts but critical for correctness.
// We re-implement them identically here for unit testing.

const RESERVED_DECK_IDS = new Set(["undefined", "null", "skip"]);
const ARCHETYPE_ALIASES: Record<string, string> = {
  dropout: "dropouts",
  dropouts: "dropouts",
  prep: "preps",
  preps: "preps",
  geek: "geeks",
  geeks: "geeks",
  freak: "freaks",
  freaks: "freaks",
  nerd: "nerds",
  nerds: "nerds",
  goodie: "goodies",
  goodies: "goodies",
  goodie_two_shoes: "goodies",
  goodietwoshoes: "goodies",
};

const normalizeDeckId = (deckId: string | null | undefined): string | null => {
  if (!deckId) return null;
  const trimmed = deckId.trim();
  if (!trimmed) return null;
  if (RESERVED_DECK_IDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

const normalizeArchetype = (value: string | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) return null;
  return ARCHETYPE_ALIASES[normalized] ?? null;
};

const normalizeCardText = (value: unknown): string | null => {
  return typeof value === "string" ? value.trim() : null;
};

type UserDeckLike = {
  deckId?: string | null;
  deckArchetype?: string | null;
  deckCode?: string | null;
  name?: string | null;
};

const resolveDeckArchetype = (deck: UserDeckLike): string | null => {
  const deckRecord: Partial<UserDeckLike> = deck;

  const direct = normalizeArchetype(normalizeCardText(deckRecord.deckArchetype) ?? undefined);
  if (direct) return direct;

  const byDeckCode =
    normalizeCardText(deckRecord.deckCode)?.endsWith("_starter")
      ? normalizeArchetype(
          normalizeCardText(deckRecord.deckCode)?.replace("_starter", ""),
        ) ?? null
      : null;
  if (byDeckCode) return byDeckCode;

  const byName =
    normalizeCardText(deckRecord.name)?.endsWith("_starter")
      ? normalizeArchetype(normalizeCardText(deckRecord.name)?.replace("_starter", "") ?? "") ??
        null
      : null;
  return byName;
};

const sortCliques = <T extends { memberCount: number; totalWins: number; name: string }>(
  cliques: T[],
) =>
  cliques.sort((a, b) => {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    return a.name.localeCompare(b.name);
  });

// ── Tests ───────────────────────────────────────────────────────────

describe("normalizeDeckId", () => {
  it("returns null for null input", () => {
    expect(normalizeDeckId(null)).toBe(null);
  });

  it("returns null for undefined input", () => {
    expect(normalizeDeckId(undefined)).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(normalizeDeckId("")).toBe(null);
  });

  it("returns null for whitespace-only", () => {
    expect(normalizeDeckId("   ")).toBe(null);
  });

  it("rejects 'undefined' (case-insensitive)", () => {
    expect(normalizeDeckId("undefined")).toBe(null);
    expect(normalizeDeckId("UNDEFINED")).toBe(null);
    expect(normalizeDeckId("Undefined")).toBe(null);
  });

  it("rejects 'null' (case-insensitive)", () => {
    expect(normalizeDeckId("null")).toBe(null);
    expect(normalizeDeckId("NULL")).toBe(null);
  });

  it("rejects 'skip' (case-insensitive)", () => {
    expect(normalizeDeckId("skip")).toBe(null);
    expect(normalizeDeckId("SKIP")).toBe(null);
  });

  it("trims and returns valid deck ID", () => {
    expect(normalizeDeckId("  deck_123  ")).toBe("deck_123");
  });

  it("accepts normal deck IDs", () => {
    expect(normalizeDeckId("abc123")).toBe("abc123");
  });

  it("rejects reserved strings with whitespace", () => {
    expect(normalizeDeckId("  undefined  ")).toBe(null);
  });
});

describe("normalizeArchetype", () => {
  it("returns null for undefined", () => {
    expect(normalizeArchetype(undefined)).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(normalizeArchetype("")).toBe(null);
  });

  it("returns null for whitespace-only", () => {
    expect(normalizeArchetype("   ")).toBe(null);
  });

  it("maps singular to plural for all archetypes", () => {
    expect(normalizeArchetype("dropout")).toBe("dropouts");
    expect(normalizeArchetype("prep")).toBe("preps");
    expect(normalizeArchetype("geek")).toBe("geeks");
    expect(normalizeArchetype("freak")).toBe("freaks");
    expect(normalizeArchetype("nerd")).toBe("nerds");
    expect(normalizeArchetype("goodie")).toBe("goodies");
  });

  it("maps plural forms correctly", () => {
    expect(normalizeArchetype("dropouts")).toBe("dropouts");
    expect(normalizeArchetype("preps")).toBe("preps");
    expect(normalizeArchetype("geeks")).toBe("geeks");
    expect(normalizeArchetype("freaks")).toBe("freaks");
    expect(normalizeArchetype("nerds")).toBe("nerds");
    expect(normalizeArchetype("goodies")).toBe("goodies");
  });

  it("handles case insensitivity", () => {
    expect(normalizeArchetype("DROPOUT")).toBe("dropouts");
    expect(normalizeArchetype("Geeks")).toBe("geeks");
    expect(normalizeArchetype("GOODIES")).toBe("goodies");
  });

  it("handles special goodies aliases", () => {
    expect(normalizeArchetype("goodie_two_shoes")).toBe("goodies");
    expect(normalizeArchetype("goodietwoshoes")).toBe("goodies");
    expect(normalizeArchetype("Goodie Two Shoes")).toBe("goodies"); // spaces → underscores
  });

  it("handles leading/trailing whitespace", () => {
    expect(normalizeArchetype("  dropout  ")).toBe("dropouts");
  });

  it("returns null for unknown archetypes", () => {
    expect(normalizeArchetype("warrior")).toBe(null);
    expect(normalizeArchetype("mage")).toBe(null);
    expect(normalizeArchetype("random")).toBe(null);
  });

  it("collapses multiple spaces to underscores", () => {
    expect(normalizeArchetype("goodie  two  shoes")).toBe("goodies");
  });
});

describe("resolveDeckArchetype", () => {
  it("resolves from direct deckArchetype field", () => {
    expect(resolveDeckArchetype({ deckArchetype: "dropout" })).toBe("dropouts");
  });

  it("resolves from deckCode _starter suffix", () => {
    expect(resolveDeckArchetype({ deckCode: "geeks_starter" })).toBe("geeks");
  });

  it("resolves from name _starter suffix", () => {
    expect(resolveDeckArchetype({ name: "nerds_starter" })).toBe("nerds");
  });

  it("prioritizes deckArchetype over deckCode", () => {
    expect(
      resolveDeckArchetype({
        deckArchetype: "dropout",
        deckCode: "geeks_starter",
        name: "nerds_starter",
      })
    ).toBe("dropouts");
  });

  it("falls through to deckCode when deckArchetype is null", () => {
    expect(
      resolveDeckArchetype({
        deckArchetype: null,
        deckCode: "freaks_starter",
      })
    ).toBe("freaks");
  });

  it("falls through to name when both deckArchetype and deckCode fail", () => {
    expect(
      resolveDeckArchetype({
        deckArchetype: null,
        deckCode: "not_a_starter",
        name: "preps_starter",
      })
    ).toBe("preps");
  });

  it("returns null when all fields are empty", () => {
    expect(resolveDeckArchetype({})).toBe(null);
  });

  it("returns null when deckCode doesn't end with _starter", () => {
    expect(resolveDeckArchetype({ deckCode: "my_custom_deck" })).toBe(null);
  });

  it("returns null when name doesn't end with _starter", () => {
    expect(resolveDeckArchetype({ name: "My Cool Deck" })).toBe(null);
  });

  it("returns null when _starter prefix is not a valid archetype", () => {
    expect(resolveDeckArchetype({ deckCode: "warrior_starter" })).toBe(null);
  });

  it("handles numeric/non-string values for deckArchetype", () => {
    expect(resolveDeckArchetype({ deckArchetype: 42 as any })).toBe(null);
  });
});

describe("sortCliques", () => {
  it("sorts by memberCount descending", () => {
    const cliques = [
      { name: "A", memberCount: 5, totalWins: 0 },
      { name: "B", memberCount: 10, totalWins: 0 },
      { name: "C", memberCount: 3, totalWins: 0 },
    ];

    sortCliques(cliques);
    expect(cliques.map((c) => c.name)).toEqual(["B", "A", "C"]);
  });

  it("uses totalWins as tiebreaker", () => {
    const cliques = [
      { name: "A", memberCount: 5, totalWins: 10 },
      { name: "B", memberCount: 5, totalWins: 20 },
      { name: "C", memberCount: 5, totalWins: 5 },
    ];

    sortCliques(cliques);
    expect(cliques.map((c) => c.name)).toEqual(["B", "A", "C"]);
  });

  it("uses name alphabetically as final tiebreaker", () => {
    const cliques = [
      { name: "Zeta", memberCount: 5, totalWins: 10 },
      { name: "Alpha", memberCount: 5, totalWins: 10 },
      { name: "Beta", memberCount: 5, totalWins: 10 },
    ];

    sortCliques(cliques);
    expect(cliques.map((c) => c.name)).toEqual(["Alpha", "Beta", "Zeta"]);
  });

  it("handles empty array", () => {
    const cliques: { name: string; memberCount: number; totalWins: number }[] = [];
    sortCliques(cliques);
    expect(cliques).toEqual([]);
  });

  it("handles single element", () => {
    const cliques = [{ name: "Only", memberCount: 1, totalWins: 0 }];
    sortCliques(cliques);
    expect(cliques).toHaveLength(1);
  });
});

describe("normalizeCardText", () => {
  it("trims strings", () => {
    expect(normalizeCardText("  hello  ")).toBe("hello");
  });

  it("returns null for non-strings", () => {
    expect(normalizeCardText(42)).toBe(null);
    expect(normalizeCardText(null)).toBe(null);
    expect(normalizeCardText(undefined)).toBe(null);
    expect(normalizeCardText({})).toBe(null);
  });

  it("returns empty string for whitespace-only", () => {
    // Note: trim() returns "" which is falsy but still a string
    expect(normalizeCardText("   ")).toBe("");
  });
});
