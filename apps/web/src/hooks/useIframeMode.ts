import { useEffect, useRef, useState } from "react";
import { signalReady, onHostMessage, type HostToGame } from "@/lib/iframe";

/**
 * Detect if the app is running inside an iframe (milaidy) or with
 * ?embedded=true query param, and manage the postMessage handshake.
 *
 * Auth tokens are classified:
 * - JWT (3 dot-separated base64 segments) → used for Convex real-time auth
 * - ltcg_ API key → used for HTTP API spectator mode
 */
export function useIframeMode() {
  const isInIframe =
    typeof window !== "undefined" && window.self !== window.top;
  const hasEmbedParam =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("embedded") === "true";
  const isEmbedded = isInIframe || hasEmbedParam;

  const [authToken, setAuthToken] = useState<string | null>(() =>
    readDebugAuthTokenFromQuery(),
  );
  const [agentId, setAgentId] = useState<string | null>(null);
  const [hostControl, setHostControl] = useState<{
    requestedMode: "story" | "pvp" | null;
    lastCommand:
      | "START_MATCH"
      | "PAUSE_AUTONOMY"
      | "RESUME_AUTONOMY"
      | "STOP_MATCH"
      | null;
    lastCommandAt: number | null;
  }>({
    requestedMode: null,
    lastCommand: null,
    lastCommandAt: null,
  });
  const signaled = useRef(false);

  useEffect(() => {
    if (!isEmbedded) return;

    // Signal ready once (only meaningful inside an iframe)
    if (isInIframe && !signaled.current) {
      signalReady();
      signaled.current = true;
    }

    // Listen for auth from host
    return onHostMessage((msg: HostToGame) => {
      if (msg.type === "LTCG_AUTH" || msg.type === "AUTH_TOKEN") {
        setAuthToken(msg.authToken);
        if (msg.agentId) setAgentId(msg.agentId);
      }
      if (msg.type === "START_MATCH") {
        setHostControl({
          requestedMode: msg.mode,
          lastCommand: "START_MATCH",
          lastCommandAt: Date.now(),
        });
      }
      if (
        msg.type === "PAUSE_AUTONOMY" ||
        msg.type === "RESUME_AUTONOMY" ||
        msg.type === "STOP_MATCH"
      ) {
        setHostControl((prev) => ({
          ...prev,
          lastCommand: msg.type,
          lastCommandAt: Date.now(),
        }));
      }
    });
  }, [isEmbedded, isInIframe]);

  // Classify the token type
  const isApiKey = authToken?.startsWith("ltcg_") ?? false;
  const isJwt = authToken ? looksLikeJWT(authToken) : false;

  return {
    isEmbedded,
    authToken,
    agentId,
    hostControl,
    /** True when the token is an ltcg_ API key (spectator mode) */
    isApiKey,
    /** True when the token is a Privy JWT (full Convex auth) */
    isJwt,
  };
}

/** Check if a token looks like a JWT (3 dot-separated base64 segments) */
function looksLikeJWT(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return parts.every((part) => base64urlPattern.test(part));
}

function readDebugAuthTokenFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.search).get("authToken");
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;

  // Only allow query-param auth tokens in dev/local contexts.
  if (import.meta.env.DEV || window.location.hostname === "localhost") {
    return trimmed;
  }

  return null;
}
