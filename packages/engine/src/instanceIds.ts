import type { CardDefinition } from "./types/cards.js";
import type { GameState, Seat } from "./types/state.js";

function getInstanceMap(state: GameState): Record<string, string> {
  const mapping = state.instanceToDefinition;
  if (mapping && typeof mapping === "object") {
    return mapping;
  }
  return {};
}

export function resolveDefinitionId(state: GameState, cardId: string): string {
  const mapping = getInstanceMap(state);
  return mapping[cardId] ?? cardId;
}

export function getCardDefinition(
  state: GameState,
  cardId: string,
): CardDefinition | undefined {
  return state.cardLookup[resolveDefinitionId(state, cardId)];
}

export function isInstanceIdKnown(state: GameState, cardId: string): boolean {
  const mapping = getInstanceMap(state);
  return Object.prototype.hasOwnProperty.call(mapping, cardId);
}

function addZoneCards(
  visible: Record<string, string>,
  state: GameState,
  cardIds: string[],
) {
  for (const cardId of cardIds) {
    const definitionId = resolveDefinitionId(state, cardId);
    if (definitionId) {
      visible[cardId] = definitionId;
    }
  }
}

export function buildVisibleInstanceDefinitions(
  state: GameState,
  seat: Seat,
): Record<string, string> {
  const visible: Record<string, string> = {};
  const isHost = seat === "host";

  const myBoard = isHost ? state.hostBoard : state.awayBoard;
  const mySpellTrap = isHost ? state.hostSpellTrapZone : state.awaySpellTrapZone;
  const myField = isHost ? state.hostFieldSpell : state.awayFieldSpell;
  const myHand = isHost ? state.hostHand : state.awayHand;
  const myGraveyard = isHost ? state.hostGraveyard : state.awayGraveyard;
  const myBanished = isHost ? state.hostBanished : state.awayBanished;

  const oppBoard = isHost ? state.awayBoard : state.hostBoard;
  const oppSpellTrap = isHost ? state.awaySpellTrapZone : state.hostSpellTrapZone;
  const oppField = isHost ? state.awayFieldSpell : state.hostFieldSpell;
  const oppGraveyard = isHost ? state.awayGraveyard : state.hostGraveyard;
  const oppBanished = isHost ? state.awayBanished : state.hostBanished;

  addZoneCards(visible, state, myHand);
  addZoneCards(visible, state, myGraveyard);
  addZoneCards(visible, state, myBanished);
  addZoneCards(visible, state, oppGraveyard);
  addZoneCards(visible, state, oppBanished);

  for (const card of myBoard) {
    visible[card.cardId] = card.definitionId;
  }
  for (const card of mySpellTrap) {
    visible[card.cardId] = card.definitionId;
  }
  if (myField) {
    visible[myField.cardId] = myField.definitionId;
  }

  for (const card of oppBoard) {
    if (!card.faceDown) {
      visible[card.cardId] = card.definitionId;
    }
  }
  for (const card of oppSpellTrap) {
    if (!card.faceDown) {
      visible[card.cardId] = card.definitionId;
    }
  }
  if (oppField && !oppField.faceDown) {
    visible[oppField.cardId] = oppField.definitionId;
  }

  for (const link of state.currentChain) {
    const definitionId = resolveDefinitionId(state, link.cardId);
    if (definitionId) {
      visible[link.cardId] = definitionId;
    }
    for (const targetId of link.targets ?? []) {
      const targetDefinitionId = resolveDefinitionId(state, targetId);
      if (targetDefinitionId) {
        visible[targetId] = targetDefinitionId;
      }
    }
  }

  if (state.pendingPong?.destroyedCardId) {
    const definitionId = resolveDefinitionId(state, state.pendingPong.destroyedCardId);
    if (definitionId) {
      visible[state.pendingPong.destroyedCardId] = definitionId;
    }
  }

  return visible;
}
