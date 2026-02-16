---
name: iframe-embedding
description: "iframe embedding strategy for milaidy Electron app integration. Use when working on embedding, cross-origin messaging, or the milaidy integration."
allowed-tools: [Read, Glob, Grep, WebSearch]
---

# iframe Embedding in milaidy

LTCG is embedded as an iframe within the [milaidy Electron app](https://github.com/milady-ai/milaidy).

## Architecture

```
milaidy (Electron)
├── Main Process
│   └── BrowserWindow
└── Renderer Process
    └── <iframe src="https://lunchtable.app/play" />
        └── LTCG Game Client (React Router 7)
```

## Embedding Approach

### Game Client Side
The LTCG frontend must:
1. Detect iframe context: `window.self !== window.top`
2. Adapt UI for embedded mode (no header/nav, fullscreen game)
3. Communicate with parent via `postMessage`
4. Handle wallet connection from parent app

### iframe Detection Hook
```typescript
function useIframeMode() {
  const isEmbedded = typeof window !== "undefined" && window.self !== window.top;
  return { isEmbedded };
}
```

### Route for Embedded Mode
```
/embed/play          # Embedded game view (no chrome)
/embed/stream/:id    # Embedded stream viewer
/embed/spectate/:id  # Embedded spectator view
```

### PostMessage Protocol
```typescript
// Game -> Parent (milaidy)
type GameToParent =
  | { type: "GAME_READY" }
  | { type: "MATCH_STARTED"; matchId: string }
  | { type: "MATCH_ENDED"; result: "win" | "loss" | "draw" }
  | { type: "REQUEST_WALLET" }
  | { type: "GAME_STATE"; state: PlayerView };

// Parent -> Game
type ParentToGame =
  | { type: "WALLET_CONNECTED"; address: string; chain: string }
  | { type: "USER_AUTH"; token: string }
  | { type: "START_MATCH"; mode: "story" | "pvp" }
  | { type: "THEME_OVERRIDE"; theme: Record<string, string> };
```

### Security
- Validate `event.origin` on all message handlers
- Never trust data from parent without validation
- Use CSP headers to restrict embedding sources

```typescript
window.addEventListener("message", (event) => {
  // Validate origin
  const allowedOrigins = ["electron://milaidy", "https://milaidy.app"];
  if (!allowedOrigins.includes(event.origin)) return;

  // Handle message
  switch (event.data.type) {
    case "WALLET_CONNECTED":
      handleWalletConnection(event.data);
      break;
  }
});
```

## Stream Embedding

retake.tv streams are embedded via iframe within the game client:

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

## Responsive Considerations

- Game board must work at various iframe sizes
- Minimum width: 320px (mobile)
- Target: 800x600 for desktop embedding
- Use `ResizeObserver` or container queries for adaptive layouts
