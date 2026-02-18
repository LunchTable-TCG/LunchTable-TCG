"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { PostHog } from "posthog-node";

// Initialize PostHog
let posthog: PostHog | null = null;
if (process.env.POSTHOG_KEY) {
    posthog = new PostHog(process.env.POSTHOG_KEY, {
        host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    });
}

let warnedMissingPosthogKey = false;

/**
 * Validates environment variables are set for analytics.
 */
function ensureEnv() {
    if (!process.env.POSTHOG_KEY && !warnedMissingPosthogKey) {
        console.warn("POSTHOG_KEY is not set. Analytics will not be tracked.");
        warnedMissingPosthogKey = true;
    }
}

export const trackEvent = action({
    args: {
        event: v.string(),
        distinctId: v.string(),
        properties: v.optional(v.any()),
    },
    returns: v.null(),
    handler: async (_ctx, args) => {
        ensureEnv();
        if (posthog) {
            posthog.capture({
                distinctId: args.distinctId,
                event: args.event,
                properties: args.properties,
            });
            await posthog.flush();
        }
        return null;
    },
});

export const reportError = action({
    args: {
        message: v.string(),
        context: v.optional(v.any()),
    },
    returns: v.null(),
    handler: async (_ctx, args) => {
        ensureEnv();
        console.error(`[Analytics] Error reported: ${args.message}`, args.context);
    },
});
