import type { CardDefinition } from "./types/index.js";

export type CardLookup = Record<string, CardDefinition>;

function validateCard(card: CardDefinition): void {
  if (!card.id) {
    throw new Error("Card must have an id");
  }
  if (!card.name) {
    throw new Error(`Card "${card.id}" must have a name`);
  }

  switch (card.type) {
    case "stereotype":
      if (card.attack === undefined || card.defense === undefined) {
        throw new Error(`Stereotype "${card.id}" must have attack and defense`);
      }
      if (card.level === undefined) {
        throw new Error(`Stereotype "${card.id}" must have a level`);
      }
      if (card.attack < 0) {
        throw new Error(`Stereotype "${card.id}" attack must be non-negative`);
      }
      if (card.defense < 0) {
        throw new Error(`Stereotype "${card.id}" defense must be non-negative`);
      }
      if (card.level < 1 || card.level > 12) {
        throw new Error(`Stereotype "${card.id}" level must be between 1 and 12`);
      }
      break;
    case "spell":
      if (!card.spellType) {
        throw new Error(`Spell "${card.id}" must have a spellType`);
      }
      break;
    case "trap":
      if (!card.trapType) {
        throw new Error(`Trap "${card.id}" must have a trapType`);
      }
      break;
  }
}

export function defineCards(cards: CardDefinition[]): CardLookup {
  const lookup: CardLookup = {};
  for (const card of cards) {
    validateCard(card);
    if (lookup[card.id]) {
      throw new Error(`Duplicate card ID: ${card.id}`);
    }
    lookup[card.id] = card;
  }
  return lookup;
}

export interface DeckValidation {
  valid: boolean;
  errors: string[];
}

export interface DeckOptions {
  maxCopies?: number;
}

export function validateDeck(
  deckCardIds: string[],
  cardLookup: CardLookup,
  sizeConstraint: { min: number; max: number },
  options?: DeckOptions,
): DeckValidation {
  const errors: string[] = [];
  const maxCopies = options?.maxCopies ?? 3;

  if (deckCardIds.length < sizeConstraint.min) {
    errors.push(`Deck has too few cards (${deckCardIds.length}/${sizeConstraint.min})`);
  }
  if (deckCardIds.length > sizeConstraint.max) {
    errors.push(`Deck has too many cards (${deckCardIds.length}/${sizeConstraint.max})`);
  }

  // Count card occurrences and check for unknown cards
  const counts = new Map<string, number>();
  for (const id of deckCardIds) {
    if (!cardLookup[id]) {
      errors.push(`Unknown card ID: ${id}`);
    } else {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  // Check copy limits
  for (const [id, count] of counts) {
    if (count > maxCopies) {
      errors.push(`Card "${id}" has ${count} copies (max ${maxCopies})`);
    }
  }

  return { valid: errors.length === 0, errors };
}
