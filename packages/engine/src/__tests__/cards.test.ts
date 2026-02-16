import { describe, it, expect } from "vitest";
import { defineCards, validateDeck } from "../cards.js";
import type { CardDefinition } from "../types/index.js";
import { EXAMPLE_CARDS } from "./fixtures/example-card-set.js";

const sampleCards: CardDefinition[] = [
  {
    id: "warrior-1",
    name: "Test Warrior",
    type: "stereotype",
    description: "A test warrior",
    rarity: "common",
    attack: 1500,
    defense: 1200,
    level: 4,
  },
  {
    id: "spell-1",
    name: "Test Spell",
    type: "spell",
    description: "A test spell",
    rarity: "common",
    spellType: "normal",
  },
];

describe("defineCards", () => {
  it("returns a card lookup map", () => {
    const lookup = defineCards(sampleCards);
    expect(lookup["warrior-1"]).toBeDefined();
    expect(lookup["warrior-1"].name).toBe("Test Warrior");
  });

  it("throws on duplicate card IDs", () => {
    const dupes = [sampleCards[0], { ...sampleCards[0] }];
    expect(() => defineCards(dupes)).toThrow("Duplicate card ID");
  });

  it("throws on stereotype without attack/defense", () => {
    const bad: CardDefinition[] = [
      { id: "bad", name: "Bad", type: "stereotype", description: "", rarity: "common" },
    ];
    expect(() => defineCards(bad)).toThrow("attack");
  });

  it("accepts cards with optional meta fields", () => {
    const cards = defineCards([
      {
        id: "meta-test",
        name: "Meta Card",
        type: "stereotype",
        description: "Card with metadata",
        rarity: "common",
        attack: 1000,
        defense: 1000,
        level: 4,
        viceType: "gambling",
        flavorText: "A test card",
        cost: 1,
        meta: { custom: true },
      },
    ]);
    expect(cards["meta-test"]?.viceType).toBe("gambling");
    expect(cards["meta-test"]?.meta?.custom).toBe(true);
  });
});

describe("validateDeck", () => {
  const lookup = defineCards(sampleCards);

  it("validates a legal deck", () => {
    // Need multiple cards to build a 40-card deck without exceeding 3 copies
    const deckCards: CardDefinition[] = [
      ...sampleCards,
      { id: "warrior-2", name: "Test Warrior 2", type: "stereotype", description: "", rarity: "common", attack: 1000, defense: 1000, level: 3 },
      { id: "warrior-3", name: "Test Warrior 3", type: "stereotype", description: "", rarity: "common", attack: 800, defense: 800, level: 2 },
      { id: "warrior-4", name: "Test Warrior 4", type: "stereotype", description: "", rarity: "common", attack: 600, defense: 600, level: 2 },
      { id: "warrior-5", name: "Test Warrior 5", type: "stereotype", description: "", rarity: "common", attack: 400, defense: 400, level: 1 },
      { id: "spell-2", name: "Test Spell 2", type: "spell", description: "", rarity: "common", spellType: "normal" },
      { id: "spell-3", name: "Test Spell 3", type: "spell", description: "", rarity: "common", spellType: "normal" },
      { id: "spell-4", name: "Test Spell 4", type: "spell", description: "", rarity: "common", spellType: "normal" },
      { id: "spell-5", name: "Test Spell 5", type: "spell", description: "", rarity: "common", spellType: "normal" },
      { id: "spell-6", name: "Test Spell 6", type: "spell", description: "", rarity: "common", spellType: "normal" },
      { id: "spell-7", name: "Test Spell 7", type: "spell", description: "", rarity: "common", spellType: "normal" },
      { id: "spell-8", name: "Test Spell 8", type: "spell", description: "", rarity: "common", spellType: "normal" },
      { id: "spell-9", name: "Test Spell 9", type: "spell", description: "", rarity: "common", spellType: "normal" },
      { id: "spell-10", name: "Test Spell 10", type: "spell", description: "", rarity: "common", spellType: "normal" },
    ];
    const deckLookup = defineCards(deckCards);

    // 3 copies of 14 different cards = 42 cards (within 40-60 range)
    const deck = [
      ...Array(3).fill("warrior-1"),
      ...Array(3).fill("warrior-2"),
      ...Array(3).fill("warrior-3"),
      ...Array(3).fill("warrior-4"),
      ...Array(3).fill("warrior-5"),
      ...Array(3).fill("spell-1"),
      ...Array(3).fill("spell-2"),
      ...Array(3).fill("spell-3"),
      ...Array(3).fill("spell-4"),
      ...Array(3).fill("spell-5"),
      ...Array(3).fill("spell-6"),
      ...Array(3).fill("spell-7"),
      ...Array(3).fill("spell-8"),
      ...Array(3).fill("spell-9"),
    ];
    const result = validateDeck(deck, deckLookup, { min: 40, max: 60 });
    expect(result.valid).toBe(true);
  });

  it("rejects a deck that is too small", () => {
    const deck = Array(10).fill("warrior-1");
    const result = validateDeck(deck, lookup, { min: 40, max: 60 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("too few");
  });

  it("rejects unknown card IDs", () => {
    const deck = Array(40).fill("nonexistent");
    const result = validateDeck(deck, lookup, { min: 40, max: 60 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unknown card");
  });
});

describe("deck copy limits", () => {
  const lookup = defineCards(sampleCards);

  it("rejects decks with more than 3 copies of the same card", () => {
    // 4 copies of warrior-1 + 36 spell-1 = 40 cards total
    const deck = [
      ...Array(4).fill("warrior-1"),
      ...Array(36).fill("spell-1"),
    ];
    const result = validateDeck(deck, lookup, { min: 40, max: 60 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Card "warrior-1" has 4 copies (max 3)');
  });

  it("accepts decks with exactly 3 copies", () => {
    // Need to create more sample cards to build a 40-card deck without exceeding 3 copies
    const extraCards: CardDefinition[] = [
      ...sampleCards,
      { id: "spell-2", name: "Test Spell 2", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-3", name: "Test Spell 3", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-4", name: "Test Spell 4", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-5", name: "Test Spell 5", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-6", name: "Test Spell 6", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-7", name: "Test Spell 7", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-8", name: "Test Spell 8", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-9", name: "Test Spell 9", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-10", name: "Test Spell 10", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-11", name: "Test Spell 11", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-12", name: "Test Spell 12", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-13", name: "Test Spell 13", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
      { id: "spell-14", name: "Test Spell 14", type: "spell", description: "A test spell", rarity: "common", spellType: "normal" },
    ];
    const extendedLookup = defineCards(extraCards);

    // 3 copies each of 14 different cards = 42 cards (over min of 40)
    const deck = [
      ...Array(3).fill("warrior-1"),
      ...Array(3).fill("spell-1"),
      ...Array(3).fill("spell-2"),
      ...Array(3).fill("spell-3"),
      ...Array(3).fill("spell-4"),
      ...Array(3).fill("spell-5"),
      ...Array(3).fill("spell-6"),
      ...Array(3).fill("spell-7"),
      ...Array(3).fill("spell-8"),
      ...Array(3).fill("spell-9"),
      ...Array(3).fill("spell-10"),
      ...Array(3).fill("spell-11"),
      ...Array(3).fill("spell-12"),
      ...Array(3).fill("spell-13"),
    ];
    const result = validateDeck(deck, extendedLookup, { min: 40, max: 60 });
    expect(result.valid).toBe(true);
  });

  it("respects custom maxCopies", () => {
    // With maxCopies: 1, having 2 warrior-1 should fail
    const deck = [
      ...Array(2).fill("warrior-1"),
      ...Array(38).fill("spell-1"),
    ];
    const result = validateDeck(deck, lookup, { min: 40, max: 60 }, { maxCopies: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Card "warrior-1" has 2 copies (max 1)');
  });

  it("allows unlimited copies when maxCopies is set very high", () => {
    const deck = Array(40).fill("warrior-1");
    const result = validateDeck(deck, lookup, { min: 40, max: 60 }, { maxCopies: 100 });
    expect(result.valid).toBe(true);
  });
});

describe("card validation", () => {
  it("rejects spell without spellType", () => {
    expect(() =>
      defineCards([
        { id: "bad-spell", name: "Bad", type: "spell", description: "", rarity: "common" },
      ])
    ).toThrow('Spell "bad-spell" must have a spellType');
  });

  it("rejects trap without trapType", () => {
    expect(() =>
      defineCards([
        { id: "bad-trap", name: "Bad", type: "trap", description: "", rarity: "common" },
      ])
    ).toThrow('Trap "bad-trap" must have a trapType');
  });

  it("rejects stereotype with negative attack", () => {
    expect(() =>
      defineCards([
        {
          id: "neg-atk",
          name: "Bad",
          type: "stereotype",
          description: "",
          rarity: "common",
          attack: -100,
          defense: 1000,
          level: 4,
        },
      ])
    ).toThrow('Stereotype "neg-atk" attack must be non-negative');
  });

  it("rejects stereotype with level out of range", () => {
    expect(() =>
      defineCards([
        {
          id: "bad-level",
          name: "Bad",
          type: "stereotype",
          description: "",
          rarity: "common",
          attack: 1000,
          defense: 1000,
          level: 0,
        },
      ])
    ).toThrow('Stereotype "bad-level" level must be between 1 and 12');
  });

  it("rejects cards with empty name", () => {
    expect(() =>
      defineCards([
        { id: "no-name", name: "", type: "spell", description: "", rarity: "common", spellType: "normal" },
      ])
    ).toThrow('Card "no-name" must have a name');
  });

  it("rejects cards with empty id", () => {
    expect(() =>
      defineCards([
        { id: "", name: "Test", type: "spell", description: "", rarity: "common", spellType: "normal" },
      ])
    ).toThrow("Card must have an id");
  });
});

describe("example card set", () => {
  it("validates the complete example set", () => {
    const lookup = defineCards(EXAMPLE_CARDS);
    expect(Object.keys(lookup)).toHaveLength(6);
  });

  it("includes all card types", () => {
    const lookup = defineCards(EXAMPLE_CARDS);
    const types = new Set(Object.values(lookup).map((c) => c.type));
    expect(types).toEqual(new Set(["stereotype", "spell", "trap"]));
  });
});
