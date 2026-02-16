---
name: agent-streaming
description: "ElizaOS agent integration and streaming setup. Use when working with AI agents, gameplay automation, or stream embedding."
allowed-tools: [Read, Glob, Grep, WebFetch, WebSearch]
---

# Agent Integration & Streaming

LTCG is designed for both human players and ElizaOS agents. Agents play the game autonomously and can stream gameplay via retake.tv.

## Agent Architecture

```
ElizaOS Agent (plugin-ltcg)
  ├── Connects to game via Convex API
  ├── Makes decisions using legalMoves()
  └── Streams gameplay via retake.tv iframe
```

## ElizaOS Plugin Reference

Original plugin: `packages/plugin-ltcg/`

### Key Actions (26 total)
- `startMatch` - Queue for matchmaking or start story battle
- `submitMove` - Submit a game command
- `endTurn` - End current turn
- `buildDeck` - Create/modify deck
- `selectStarterDeck` - Choose starter deck
- `getGameState` - Get current game state
- `getPlayerView` - Get masked player view
- `declareAttack` - Attack with a monster
- `activateCard` - Activate spell/trap/effect

### Agent Decision Loop
```typescript
// 1. Get legal moves
const moves = legalMoves(state, mySeat);

// 2. Pick best move (AI logic)
const chosen = pickBestMove(moves, strategy);

// 3. Submit via Convex
await submitAction(matchId, chosen, mySeat);

// 4. Wait for state update
const newView = await getPlayerView(matchId, mySeat);
```

### Character Definition
```typescript
// characters/dizzy.character.json
{
  name: "Dizzy",
  // ElizaOS character config
  // Personality, goals, strategy preferences
}
```

## Streaming

Agents stream gameplay via **retake.tv** - the agent handles its own streaming independently. The game client displays the stream via an embedded iframe.

### Stream Viewer Component
```tsx
function StreamViewer({ streamId }: { streamId: string }) {
  return (
    <iframe
      src={`https://retake.tv/embed/${streamId}`}
      className="w-full aspect-video border-0"
      allow="autoplay; fullscreen"
    />
  );
}
```

### Stream Integration Points
- Game UI can show agent streams alongside the game board
- Spectator mode can embed stream + game state side by side
- milaidy Electron app can show stream in a dedicated panel

## AI Opponent (Server-Side)

Current implementation in `convex/game.ts`:

```typescript
// executeAITurn is scheduled after player action
export const executeAITurn = internalMutation({
  handler: async (ctx, { matchId }) => {
    // Load state
    // Get legalMoves(state, "away")
    // Pick move (currently just END_TURN - needs improvement)
    // Submit via match component
  },
});
```

### Future AI Strategy
```typescript
// Smart AI should:
// 1. Evaluate board state
// 2. Consider card advantage
// 3. Calculate lethal
// 4. Prioritize threats
// 5. Use engine's legalMoves() as constraint
```

## Key Dependencies

```json
{
  "@elizaos/core": "^1.7.2",
  "@elizaos/plugin-openrouter": "^1.5.17"
}
```

## Verify with MCP

For ElizaOS patterns: `mcp__deepwiki__ask_question` with `elizaos/eliza`
