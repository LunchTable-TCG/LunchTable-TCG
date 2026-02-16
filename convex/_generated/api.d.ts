/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentAuth from "../agentAuth.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as cardData from "../cardData.js";
import type * as cliques from "../cliques.js";
import type * as crons from "../crons.js";
import type * as dailyBriefing from "../dailyBriefing.js";
import type * as game from "../game.js";
import type * as http from "../http.js";
import type * as seed from "../seed.js";
import type * as starterDeckHelpers from "../starterDeckHelpers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentAuth: typeof agentAuth;
  analytics: typeof analytics;
  auth: typeof auth;
  cardData: typeof cardData;
  cliques: typeof cliques;
  crons: typeof crons;
  dailyBriefing: typeof dailyBriefing;
  game: typeof game;
  http: typeof http;
  seed: typeof seed;
  starterDeckHelpers: typeof starterDeckHelpers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  lunchtable_tcg_cards: {
    cards: {
      addCardsToInventory: FunctionReference<
        "mutation",
        "internal",
        {
          cardDefinitionId: string;
          quantity: number;
          serialNumber?: number;
          source?: string;
          userId: string;
          variant?: "standard" | "foil" | "alt_art" | "full_art" | "numbered";
        },
        { newQuantity: number; success: boolean }
      >;
      createCardDefinition: FunctionReference<
        "mutation",
        "internal",
        {
          ability?: any;
          archetype: string;
          attack?: number;
          attribute?: string;
          cardType: string;
          cost: number;
          defense?: number;
          flavorText?: string;
          imageUrl?: string;
          isActive?: boolean;
          level?: number;
          name: string;
          rarity: string;
          spellType?: string;
          trapType?: string;
        },
        string
      >;
      getAllCards: FunctionReference<"query", "internal", {}, any>;
      getCard: FunctionReference<"query", "internal", { cardId: string }, any>;
      getCardsBatch: FunctionReference<
        "query",
        "internal",
        { cardIds: Array<string> },
        any
      >;
      getCollectionStats: FunctionReference<
        "query",
        "internal",
        { userId: string },
        { favoriteCount: number; totalCards: number; uniqueCards: number }
      >;
      getUserCards: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      getUserFavoriteCards: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      removeCardsFromInventory: FunctionReference<
        "mutation",
        "internal",
        { cardDefinitionId: string; quantity: number; userId: string },
        { remainingQuantity: number; success: boolean }
      >;
      toggleCardActive: FunctionReference<
        "mutation",
        "internal",
        { cardId: string },
        { isActive: boolean }
      >;
      toggleFavorite: FunctionReference<
        "mutation",
        "internal",
        { playerCardId: string; userId: string },
        { isFavorite: boolean }
      >;
      updateCardDefinition: FunctionReference<
        "mutation",
        "internal",
        {
          ability?: any;
          archetype?: string;
          attack?: number;
          attribute?: string;
          cardId: string;
          cardType?: string;
          cost?: number;
          defense?: number;
          flavorText?: string;
          imageUrl?: string;
          isActive?: boolean;
          level?: number;
          name?: string;
          rarity?: string;
          spellType?: string;
          trapType?: string;
        },
        { success: boolean }
      >;
    };
    decks: {
      createDeck: FunctionReference<
        "mutation",
        "internal",
        {
          deckArchetype?: string;
          description?: string;
          maxDecks?: number;
          name: string;
          userId: string;
        },
        string
      >;
      deleteDeck: FunctionReference<
        "mutation",
        "internal",
        { deckId: string },
        any
      >;
      duplicateDeck: FunctionReference<
        "mutation",
        "internal",
        { deckId: string; maxDecks?: number; name: string },
        string
      >;
      getDeckStats: FunctionReference<
        "query",
        "internal",
        { deckId: string },
        {
          averageCost: number;
          cardsByRarity: {
            common: number;
            epic: number;
            legendary: number;
            rare: number;
            uncommon: number;
          };
          cardsByType: {
            class: number;
            spell: number;
            stereotype: number;
            trap: number;
          };
          totalCards: number;
        }
      >;
      getDeckWithCards: FunctionReference<
        "query",
        "internal",
        { deckId: string },
        any
      >;
      getUserDecks: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          cardCount: number;
          createdAt: number;
          deckArchetype?: string;
          deckId: string;
          description?: string;
          name: string;
          updatedAt: number;
        }>
      >;
      renameDeck: FunctionReference<
        "mutation",
        "internal",
        { deckId: string; name: string },
        any
      >;
      saveDeck: FunctionReference<
        "mutation",
        "internal",
        {
          cards: Array<{ cardDefinitionId: string; quantity: number }>;
          deckId: string;
          maxCopies?: number;
          maxLegendaryCopies?: number;
          maxSize?: number;
          minSize?: number;
        },
        any
      >;
      selectStarterDeck: FunctionReference<
        "mutation",
        "internal",
        {
          deckCode: string;
          starterCards: Array<{
            ability?: any;
            archetype: string;
            attack?: number;
            attribute?: string;
            cardType: string;
            cost: number;
            defense?: number;
            flavorText?: string;
            imageUrl?: string;
            level?: number;
            name: string;
            rarity: string;
            spellType?: string;
            trapType?: string;
          }>;
          userId: string;
        },
        { cardsReceived: number; deckId: string; deckSize: number }
      >;
      setActiveDeck: FunctionReference<
        "mutation",
        "internal",
        {
          deckId: string;
          maxCopies?: number;
          maxLegendaryCopies?: number;
          maxSize?: number;
          minSize?: number;
          userId: string;
        },
        string
      >;
      validateDeck: FunctionReference<
        "query",
        "internal",
        {
          deckId: string;
          maxCopies?: number;
          maxLegendaryCopies?: number;
          maxSize?: number;
          minSize?: number;
        },
        {
          errors: Array<string>;
          isValid: boolean;
          totalCards: number;
          warnings: Array<string>;
        }
      >;
    };
    seeds: {
      seedCardDefinitions: FunctionReference<
        "mutation",
        "internal",
        {
          cards: Array<{
            ability?: any;
            archetype: string;
            attack?: number;
            attribute?: string;
            breakdownEffect?: any;
            breakdownFlavorText?: string;
            cardType: string;
            cost: number;
            defense?: number;
            flavorText?: string;
            imageUrl?: string;
            level?: number;
            name: string;
            rarity: string;
            spellType?: string;
            trapType?: string;
            viceType?: string;
          }>;
        },
        { created: number; skipped: number }
      >;
      seedStarterDecks: FunctionReference<
        "mutation",
        "internal",
        {
          decks: Array<{
            archetype: string;
            cardCount: number;
            deckCode: string;
            description: string;
            name: string;
            playstyle: string;
          }>;
        },
        { created: number; skipped: number }
      >;
    };
  };
  lunchtable_tcg_match: {
    mutations: {
      createMatch: FunctionReference<
        "mutation",
        "internal",
        {
          awayDeck: Array<string>;
          awayId: string;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
        },
        string
      >;
      startMatch: FunctionReference<
        "mutation",
        "internal",
        { initialState: string; matchId: string },
        null
      >;
      submitAction: FunctionReference<
        "mutation",
        "internal",
        {
          cardLookup?: string;
          command: string;
          matchId: string;
          seat: "host" | "away";
        },
        { events: string; version: number }
      >;
    };
    queries: {
      getActiveMatchByHost: FunctionReference<
        "query",
        "internal",
        { hostId: string },
        any
      >;
      getMatchMeta: FunctionReference<
        "query",
        "internal",
        { matchId: string },
        any
      >;
      getOpenPrompt: FunctionReference<
        "query",
        "internal",
        { matchId: string; seat: "host" | "away" },
        any
      >;
      getPlayerView: FunctionReference<
        "query",
        "internal",
        { matchId: string; seat: "host" | "away" },
        string | null
      >;
      getRecentEvents: FunctionReference<
        "query",
        "internal",
        { matchId: string; sinceVersion: number },
        any
      >;
    };
  };
  lunchtable_tcg_story: {
    chapters: {
      createChapter: FunctionReference<
        "mutation",
        "internal",
        {
          actNumber?: number;
          aiDifficulty?:
            | "easy"
            | "medium"
            | "hard"
            | "boss"
            | { hard: number; legendary: number; normal: number };
          aiOpponentDeckCode?: string;
          archetype?: string;
          archetypeImageUrl?: string;
          baseRewards?: { gems?: number; gold: number; xp: number };
          battleCount?: number;
          chapterNumber?: number;
          description: string;
          imageUrl?: string;
          isActive?: boolean;
          loreText?: string;
          number?: number;
          status?: "draft" | "published";
          storyText?: string;
          title: string;
          unlockCondition?: {
            requiredChapterId?: string;
            requiredLevel?: number;
            type: "chapter_complete" | "player_level" | "none";
          };
          unlockRequirements?: {
            minimumLevel?: number;
            previousChapter?: boolean;
          };
        },
        string
      >;
      getChapter: FunctionReference<
        "query",
        "internal",
        { chapterId: string },
        any
      >;
      getChapterByNumber: FunctionReference<
        "query",
        "internal",
        { actNumber: number; chapterNumber: number },
        any
      >;
      getChapters: FunctionReference<
        "query",
        "internal",
        { actNumber?: number; status?: "draft" | "published" },
        any
      >;
      updateChapter: FunctionReference<
        "mutation",
        "internal",
        { chapterId: string; updates: any },
        null
      >;
    };
    progress: {
      getBattleAttempts: FunctionReference<
        "query",
        "internal",
        { limit?: number; userId: string },
        any
      >;
      getChapterProgress: FunctionReference<
        "query",
        "internal",
        { actNumber: number; chapterNumber: number; userId: string },
        any
      >;
      getProgress: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      getStageProgress: FunctionReference<
        "query",
        "internal",
        { stageId?: string; userId: string },
        any
      >;
      recordBattleAttempt: FunctionReference<
        "mutation",
        "internal",
        {
          actNumber: number;
          chapterNumber: number;
          difficulty: "normal" | "hard" | "legendary";
          finalLP: number;
          outcome: "won" | "lost" | "abandoned";
          progressId: string;
          rewardsEarned: { cards?: Array<string>; gold: number; xp: number };
          starsEarned: number;
          userId: string;
        },
        string
      >;
      upsertProgress: FunctionReference<
        "mutation",
        "internal",
        {
          actNumber: number;
          bestScore?: number;
          chapterNumber: number;
          difficulty: "normal" | "hard" | "legendary";
          firstCompletedAt?: number;
          lastAttemptedAt?: number;
          starsEarned: number;
          status: "locked" | "available" | "in_progress" | "completed";
          timesAttempted: number;
          timesCompleted: number;
          userId: string;
        },
        string
      >;
      upsertStageProgress: FunctionReference<
        "mutation",
        "internal",
        {
          bestScore?: number;
          chapterId: string;
          firstClearClaimed: boolean;
          lastCompletedAt?: number;
          stageId: string;
          stageNumber: number;
          starsEarned: number;
          status: "locked" | "available" | "completed" | "starred";
          timesCompleted: number;
          userId: string;
        },
        string
      >;
    };
    seeds: {
      seedChapters: FunctionReference<
        "mutation",
        "internal",
        { chapters: Array<any> },
        number
      >;
      seedStages: FunctionReference<
        "mutation",
        "internal",
        { stages: Array<any> },
        number
      >;
    };
    stages: {
      createStage: FunctionReference<
        "mutation",
        "internal",
        {
          aiDifficulty?: "easy" | "medium" | "hard" | "boss";
          cardRewardId?: string;
          chapterId: string;
          description: string;
          difficulty?: "easy" | "medium" | "hard" | "boss";
          firstClearBonus?:
            | { gems?: number; gold?: number; xp?: number }
            | number;
          firstClearGems?: number;
          firstClearGold?: number;
          name?: string;
          opponentDeckArchetype?: string;
          opponentDeckId?: string;
          opponentName?: string;
          postMatchLoseDialogue?: Array<{ speaker: string; text: string }>;
          postMatchWinDialogue?: Array<{ speaker: string; text: string }>;
          preMatchDialogue?: Array<{
            imageUrl?: string;
            speaker: string;
            text: string;
          }>;
          repeatGold?: number;
          rewardGold?: number;
          rewardXp?: number;
          stageNumber: number;
          status?: "draft" | "published";
          title?: string;
        },
        string
      >;
      getStage: FunctionReference<
        "query",
        "internal",
        { stageId: string },
        any
      >;
      getStages: FunctionReference<
        "query",
        "internal",
        { chapterId: string },
        any
      >;
      updateStage: FunctionReference<
        "mutation",
        "internal",
        { stageId: string; updates: any },
        null
      >;
    };
  };
};
