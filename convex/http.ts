import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { buildApiKeyPrefix, isSupportedAgentApiKey } from "./agentApiKey";
import { isPlainObject, normalizeGameCommand } from "./agentRouteHelpers";
import {
  deriveInlinePrimaryCommands,
  fallbackInlineCommands,
  paginateInlineCommands,
} from "./telegramInline";
import { getTelegramMiniAppDeepLink } from "./telegramLinks";

const http = httpRouter();
const internalApi = internal as any;

// CORS configuration
const ALLOWED_HEADERS = ["Content-Type", "Authorization"];

/**
 * Wrap a handler with CORS headers
 */
function corsHandler(
	handler: (ctx: any, request: Request) => Promise<Response>,
): (ctx: any, request: Request) => Promise<Response> {
	return async (ctx, request) => {
		// Handle preflight OPTIONS request
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
					"Access-Control-Allow-Headers": ALLOWED_HEADERS.join(", "),
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		// Call actual handler
		const response = await handler(ctx, request);

		// Add CORS headers to response
		const newHeaders = new Headers(response.headers);
		newHeaders.set("Access-Control-Allow-Origin", "*");
		newHeaders.set("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders,
		});
	};
}

/**
 * Register a route with CORS support (includes OPTIONS preflight)
 */
function corsRoute({
	path,
	method,
	handler,
}: {
	path: string;
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	handler: (ctx: any, request: Request) => Promise<Response>;
}) {
	// Register the actual method
	http.route({
		path,
		method,
		handler: httpAction(corsHandler(handler)),
	});
	// Register OPTIONS preflight for the same path
	if (!registeredOptions.has(path)) {
		registeredOptions.add(path);
		http.route({
			path,
			method: "OPTIONS",
			handler: httpAction(
				corsHandler(async () => new Response(null, { status: 204 })),
			),
		});
	}
}

const registeredOptions = new Set<string>();

// ── Agent Auth Middleware ─────────────────────────────────────────

async function authenticateAgent(ctx: { runQuery: any }, request: Request) {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return null;
	}

	const apiKey = authHeader.slice(7);
	if (!isSupportedAgentApiKey(apiKey)) {
		return null;
	}

	// Hash the key and look up
	const encoder = new TextEncoder();
	const data = encoder.encode(apiKey);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const apiKeyHash = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	const agent = await ctx.runQuery(api.agentAuth.getAgentByKeyHash, {
		apiKeyHash,
	});
	if (!agent || !agent.isActive) return null;

	return agent;
}

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function errorResponse(message: string, status = 400) {
	return jsonResponse({ error: message }, status);
}

async function parseRequestJson(request: Request) {
	try {
		return await request.json();
	} catch {
		return {};
	}
}

type MatchSeat = "host" | "away";

export async function resolveMatchAndSeat(
	ctx: { runQuery: any },
	agentUserId: string,
	matchId: string,
	requestedSeat?: string,
) {
	const meta = await ctx.runQuery(api.game.getMatchMeta, {
		matchId,
		actorUserId: agentUserId,
	});
	if (!meta) {
		throw new Error("Match not found");
	}

	const hostId = (meta as any).hostId;
	const awayId = (meta as any).awayId;

	if (
		requestedSeat !== undefined &&
		requestedSeat !== "host" &&
		requestedSeat !== "away"
	) {
		throw new Error("seat must be 'host' or 'away'.");
	}

	const seat = requestedSeat as MatchSeat | undefined;

	if (seat === "host") {
		if (hostId !== agentUserId) {
			throw new Error("You are not the host in this match.");
		}
		return { meta, seat: "host" as MatchSeat };
	}

	if (seat === "away") {
		if (awayId !== agentUserId) {
			throw new Error("You are not the away player in this match.");
		}
		return { meta, seat: "away" as MatchSeat };
	}

	if (hostId === agentUserId) {
		return { meta, seat: "host" as MatchSeat };
	}
	if (awayId === agentUserId) {
		return { meta, seat: "away" as MatchSeat };
	}

	throw new Error("You are not a participant in this match.");
}

// ── Routes ───────────────────────────────────────────────────────

corsRoute({
	path: "/api/agent/register",
	method: "POST",
	handler: async (ctx, request) => {
		const body = await request.json();
		const { name } = body;

		if (
			!name ||
			typeof name !== "string" ||
			name.length < 1 ||
			name.length > 50
		) {
			return errorResponse("Name is required (1-50 characters).");
		}

		// Generate a random API key
		const randomBytes = new Uint8Array(32);
		crypto.getRandomValues(randomBytes);
		const keyBody = Array.from(randomBytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		const apiKey = `ltcg_${keyBody}`;
		const apiKeyPrefix = buildApiKeyPrefix(apiKey);

		// Hash the key for storage
		const encoder = new TextEncoder();
		const data = encoder.encode(apiKey);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const apiKeyHash = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		const result = await ctx.runMutation(api.agentAuth.registerAgent, {
			name,
			apiKeyHash,
			apiKeyPrefix,
		});

		return jsonResponse({
			agentId: result.agentId,
			userId: result.userId,
			apiKey, // Shown once — cannot be retrieved again
			apiKeyPrefix,
			message: "Save your API key! It cannot be retrieved again.",
		});
	},
});

corsRoute({
	path: "/api/agent/me",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		// Check if there's an unread daily briefing
		const briefing = await ctx.runQuery(
			api.dailyBriefing.getAgentDailyBriefing,
			{
				agentId: agent._id,
				userId: agent.userId,
			},
		);

		return jsonResponse({
			id: agent._id,
			name: agent.name,
			userId: agent.userId,
			apiKeyPrefix: agent.apiKeyPrefix,
			isActive: agent.isActive,
			createdAt: agent.createdAt,
			dailyBriefing: briefing?.active
				? {
						available: true,
						checkedIn: briefing.checkedIn,
						event: briefing.event,
						announcement: briefing.announcement,
					}
				: { available: false, checkedIn: false },
		});
	},
});

corsRoute({
	path: "/api/agent/game/start",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const body = await request.json();
		const { chapterId, stageNumber } = body;

		if (!chapterId || typeof chapterId !== "string") {
			return errorResponse("chapterId is required.");
		}

		try {
			const result = await ctx.runMutation(api.agentAuth.agentStartBattle, {
				agentUserId: agent.userId,
				chapterId,
				stageNumber: typeof stageNumber === "number" ? stageNumber : undefined,
			});
			return jsonResponse(result);
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}
	},
});

corsRoute({
	path: "/api/agent/game/start-duel",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		try {
			const result = await ctx.runMutation(api.agentAuth.agentStartDuel, {
				agentUserId: agent.userId,
			});
			return jsonResponse(result);
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}
	},
});

corsRoute({
	path: "/api/agent/game/join",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const body = await request.json();
		const { matchId } = body;

		if (!matchId || typeof matchId !== "string") {
			return errorResponse("matchId is required.");
		}

		try {
			const result = await ctx.runMutation(api.agentAuth.agentJoinMatch, {
				agentUserId: agent.userId,
				matchId,
			});
			return jsonResponse(result);
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}
	},
});

corsRoute({
	path: "/api/agent/game/action",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const body = await request.json();
		const { matchId, command, seat: requestedSeat, expectedVersion } = body;

		if (!matchId || !command) {
			return errorResponse("matchId and command are required.");
		}
		if (expectedVersion !== undefined && typeof expectedVersion !== "number") {
			return errorResponse("expectedVersion must be a number.");
		}

		let resolvedSeat: MatchSeat;
		try {
			({ seat: resolvedSeat } = await resolveMatchAndSeat(
				ctx,
				agent.userId,
				matchId,
				requestedSeat,
			));
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}

		let parsedCommand = command;
		if (typeof command === "string") {
			try {
				parsedCommand = JSON.parse(command);
			} catch {
				return errorResponse(
					"command must be valid JSON or a JSON-compatible object.",
				);
			}
		}
		if (!isPlainObject(parsedCommand)) {
			return errorResponse("command must be an object.");
		}

		const normalizedCommand = normalizeGameCommand(parsedCommand);
		if (!isPlainObject(normalizedCommand)) {
			return errorResponse("command must be an object after normalization.");
		}

		try {
			const result = await ctx.runMutation(api.game.submitAction, {
				matchId,
				command: JSON.stringify(normalizedCommand),
				seat: resolvedSeat,
				actorUserId: agent.userId,
				expectedVersion:
					typeof expectedVersion === "number"
						? Number(expectedVersion)
						: undefined,
			});
			return jsonResponse(result);
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}
	},
});

corsRoute({
	path: "/api/agent/game/view",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const url = new URL(request.url);
		const matchId = url.searchParams.get("matchId");
		const requestedSeat = url.searchParams.get("seat") ?? undefined;

		if (!matchId) {
			return errorResponse("matchId query parameter is required.");
		}

		let seat: MatchSeat;
		try {
			({ seat } = await resolveMatchAndSeat(
				ctx,
				agent.userId,
				matchId,
				requestedSeat,
			));
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}

		try {
			const view = await ctx.runQuery(api.game.getPlayerView, {
				matchId,
				seat,
				actorUserId: agent.userId,
			});
			if (!view) return errorResponse("Match state not found", 404);
			// getPlayerView returns a JSON string — parse before wrapping
			const parsed = typeof view === "string" ? JSON.parse(view) : view;
			return jsonResponse(parsed);
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}
	},
});

// ── Agent Setup Routes ──────────────────────────────────────────

corsRoute({
	path: "/api/agent/game/chapters",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const chapters = await ctx.runQuery(api.game.getChapters, {});
		return jsonResponse(chapters);
	},
});

corsRoute({
	path: "/api/agent/game/starter-decks",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const decks = await ctx.runQuery(api.game.getStarterDecks, {});
		return jsonResponse(decks);
	},
});

corsRoute({
	path: "/api/agent/game/select-deck",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const body = await request.json();
		const { deckCode } = body;

		if (!deckCode || typeof deckCode !== "string") {
			return errorResponse("deckCode is required.");
		}

		try {
			const result = await ctx.runMutation(
				api.agentAuth.agentSelectStarterDeck,
				{
					agentUserId: agent.userId,
					deckCode,
				},
			);
			return jsonResponse(result);
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}
	},
});

// ── Agent Story Endpoints ──────────────────────────────────────

corsRoute({
  path: "/api/agent/story/progress",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const result = await ctx.runQuery(internalApi.game.getFullStoryProgressForUser, {
      userId: agent.userId,
    });
    return jsonResponse(result);
  },
});

corsRoute({
  path: "/api/agent/story/next-stage",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const result = await ctx.runQuery(internalApi.game.getNextStoryStageForUser, {
      userId: agent.userId,
    });
    return jsonResponse(result);
  },
});

corsRoute({
  path: "/api/agent/story/stage",
  method: "GET",
  handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const url = new URL(request.url);
		const chapterId = url.searchParams.get("chapterId");
		const stageNumber = url.searchParams.get("stageNumber");

		if (!chapterId || !stageNumber) {
			return errorResponse("chapterId and stageNumber query params required.");
		}

		const stage = await ctx.runQuery(api.game.getStageWithNarrative, {
			chapterId,
			stageNumber: parseInt(stageNumber, 10),
		});

		if (!stage) return errorResponse("Stage not found", 404);
		return jsonResponse(stage);
	},
});

corsRoute({
	path: "/api/agent/story/complete-stage",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const body = await request.json();
		const { matchId } = body;

		if (!matchId || typeof matchId !== "string") {
			return errorResponse("matchId is required.");
		}

		try {
			const result = await ctx.runMutation(api.game.completeStoryStage, {
				matchId,
				actorUserId: agent.userId,
			});
			return jsonResponse(result);
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}
	},
});

corsRoute({
	path: "/api/agent/game/match-status",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const url = new URL(request.url);
		const matchId = url.searchParams.get("matchId");

		if (!matchId) {
			return errorResponse("matchId query parameter is required.");
		}

		try {
			const { meta: validatedMeta, seat } = await resolveMatchAndSeat(
				ctx,
				agent.userId,
				matchId,
			);
			const storyCtx = await ctx.runQuery(api.game.getStoryMatchContext, {
				matchId,
			});

			return jsonResponse({
				matchId,
				status: (validatedMeta as any)?.status,
				mode: (validatedMeta as any)?.mode,
				winner: (validatedMeta as any)?.winner ?? null,
				endReason: (validatedMeta as any)?.endReason ?? null,
				isGameOver: (validatedMeta as any)?.status === "ended",
				hostId: (validatedMeta as any)?.hostId ?? null,
				awayId: (validatedMeta as any)?.awayId ?? null,
				seat,
				chapterId: storyCtx?.chapterId ?? null,
				stageNumber: storyCtx?.stageNumber ?? null,
				outcome: storyCtx?.outcome ?? null,
				starsEarned: storyCtx?.starsEarned ?? null,
			});
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}
	},
});

// ── Agent Active Match ──────────────────────────────────────

corsRoute({
	path: "/api/agent/active-match",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const activeMatch = await ctx.runQuery(api.game.getActiveMatchByHost, {
			hostId: agent.userId,
		});

		if (!activeMatch) {
			return jsonResponse({ matchId: null, status: null });
		}

		let seat: MatchSeat;
		try {
			({ seat } = await resolveMatchAndSeat(
				ctx,
				agent.userId,
				activeMatch._id,
			));
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}

		return jsonResponse({
			matchId: activeMatch._id,
			status: activeMatch.status,
			mode: activeMatch.mode,
			createdAt: activeMatch.createdAt,
			hostId: (activeMatch as any).hostId,
			awayId: (activeMatch as any).awayId,
			seat,
		});
	},
});

// ── Agent Daily Briefing ─────────────────────────────────────

corsRoute({
	path: "/api/agent/daily-briefing",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const briefing = await ctx.runQuery(
			api.dailyBriefing.getAgentDailyBriefing,
			{
				agentId: agent._id,
				userId: agent.userId,
			},
		);

		return jsonResponse(briefing);
	},
});

corsRoute({
	path: "/api/agent/checkin",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		// Record check-in
		const checkinResult = await ctx.runMutation(
			api.dailyBriefing.agentCheckin,
			{
				agentId: agent._id,
				userId: agent.userId,
			},
		);

		// Return full briefing with check-in status
		const briefing = await ctx.runQuery(
			api.dailyBriefing.getAgentDailyBriefing,
			{
				agentId: agent._id,
				userId: agent.userId,
			},
		);

		return jsonResponse({
			...briefing,
			checkinStatus: checkinResult,
		});
	},
});

// ── RPG Namespace ────────────────────────────────────────────

corsRoute({
	path: "/api/rpg/agent/register",
	method: "POST",
	handler: async (ctx, request) => {
		const body = await parseRequestJson(request);
		const name = typeof body?.name === "string" ? body.name : "";
		if (!name || name.length > 50) {
			return errorResponse("Name is required (1-50 characters).");
		}

		const randomBytes = new Uint8Array(32);
		crypto.getRandomValues(randomBytes);
		const keyBody = Array.from(randomBytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		const apiKey = `rpg_${keyBody}`;
		const apiKeyPrefix = buildApiKeyPrefix(apiKey);

		const encoder = new TextEncoder();
		const hashBuffer = await crypto.subtle.digest(
			"SHA-256",
			encoder.encode(apiKey),
		);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const apiKeyHash = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		const result = await ctx.runMutation(api.agentAuth.registerAgent, {
			name,
			apiKeyHash,
			apiKeyPrefix,
		});

		return jsonResponse({
			id: result.agentId,
			userId: result.userId,
			apiKey,
			apiKeyPrefix,
			message: "Save your API key. This token is shown once.",
		});
	},
});

corsRoute({
	path: "/api/rpg/agent/me",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		return jsonResponse({
			id: agent._id,
			userId: agent.userId,
			name: agent.name,
			apiKeyPrefix: agent.apiKeyPrefix,
			isActive: agent.isActive,
			schemaVersion: "1.0.0",
			capabilities: {
				seats: [
					"dm",
					"player_1",
					"player_2",
					"player_3",
					"player_4",
					"player_5",
					"player_6",
					"narrator",
					"npc_controller",
				],
				autonomy: "full",
			},
		});
	},
});

corsRoute({
	path: "/api/rpg/worlds/create",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);

		const result = await ctx.runMutation((api as any).rpg.createWorld, {
			ownerId: agent.userId,
			title: body?.title ?? "Untitled World",
			slug: body?.slug,
			description: body?.description ?? "",
			genre: body?.genre ?? "mixed",
			tags: Array.isArray(body?.tags) ? body.tags : [],
			visibility: body?.visibility,
			manifest: body?.manifest ?? {},
		});

		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/publish",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldId) return errorResponse("worldId is required");

		const result = await ctx.runMutation((api as any).rpg.publishWorld, {
			worldId: body.worldId,
			ownerId: agent.userId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/fork",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.sourceWorldId) return errorResponse("sourceWorldId is required");

		const result = await ctx.runMutation((api as any).rpg.forkWorld, {
			sourceWorldId: body.sourceWorldId,
			newOwnerId: agent.userId,
			title: body?.title,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/install",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldVersionId)
			return errorResponse("worldVersionId is required");

		const result = await ctx.runMutation((api as any).rpg.installWorld, {
			worldVersionId: body.worldVersionId,
			installerId: agent.userId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/list",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit") ?? 20);
		const worlds = await ctx.runQuery((api as any).rpg.listWorlds, { limit });
		return jsonResponse({ worlds });
	},
});

corsRoute({
	path: "/api/rpg/worlds/search",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const query = url.searchParams.get("q") ?? "";
		const limit = Number(url.searchParams.get("limit") ?? 20);
		const worlds = await ctx.runQuery((api as any).rpg.searchWorlds, {
			query,
			limit,
		});
		return jsonResponse({ worlds });
	},
});

corsRoute({
	path: "/api/rpg/worlds/bootstrap",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const result = await ctx.runMutation(
			(api as any).rpg.bootstrapFlagshipWorlds,
			{
				ownerId: agent.userId,
			},
		);
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/slug",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const slug = url.searchParams.get("slug");
		if (!slug) return errorResponse("slug is required");
		const world = await ctx.runQuery((api as any).rpg.getWorldBySlug, { slug });
		return jsonResponse(world);
	},
});

corsRoute({
	path: "/api/rpg/worlds/detail",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const worldId = url.searchParams.get("worldId");
		if (!worldId) return errorResponse("worldId is required");
		const detail = await ctx.runQuery((api as any).rpg.getWorldDetail, {
			worldId,
		});
		return jsonResponse(detail);
	},
});

corsRoute({
	path: "/api/rpg/worlds/featured",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit") ?? 12);
		const worlds = await ctx.runQuery((api as any).rpg.listFeaturedWorlds, {
			limit,
		});
		return jsonResponse({ worlds });
	},
});

corsRoute({
	path: "/api/rpg/campaigns/generate",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldId) return errorResponse("worldId is required");

		const result = await ctx.runMutation((api as any).rpg.generateCampaign, {
			worldId: body.worldId,
			ownerId: agent.userId,
			title: body?.title ?? "Generated Campaign",
			stages: typeof body?.stages === "number" ? body.stages : 12,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/campaigns/validate",
	method: "POST",
	handler: async (ctx, request) => {
		const body = await parseRequestJson(request);
		if (!body?.campaignId) return errorResponse("campaignId is required");
		const result = await ctx.runQuery((api as any).rpg.validateCampaign, {
			campaignId: body.campaignId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/characters/create",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldId) return errorResponse("worldId is required");

		const result = await ctx.runMutation((api as any).rpg.createCharacter, {
			ownerId: agent.userId,
			worldId: body.worldId,
			name: body?.name ?? "Unnamed Character",
			classId: body?.classId,
			stats: body?.stats ?? {},
			inventory: body?.inventory ?? [],
			abilities: body?.abilities ?? [],
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/characters/level",
	method: "POST",
	handler: async (ctx, request) => {
		const body = await parseRequestJson(request);
		if (!body?.characterId) return errorResponse("characterId is required");
		const result = await ctx.runMutation((api as any).rpg.levelCharacter, {
			characterId: body.characterId,
			levels: typeof body?.levels === "number" ? body.levels : 1,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/characters/export",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const characterId = url.searchParams.get("characterId");
		if (!characterId) return errorResponse("characterId is required");
		const result = await ctx.runQuery((api as any).rpg.exportCharacter, {
			characterId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/sessions/create",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldVersionId)
			return errorResponse("worldVersionId is required");

		const result = await ctx.runMutation((api as any).rpg.createSession, {
			ownerId: agent.userId,
			worldVersionId: body.worldVersionId,
			title: body?.title ?? "RPG Session",
			seatLimit: body?.seatLimit,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/sessions/join",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.sessionId) return errorResponse("sessionId is required");

		const result = await ctx.runMutation((api as any).rpg.joinSession, {
			sessionId: body.sessionId,
			actorId: agent.userId,
			seat: body?.seat ?? "player_1",
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/sessions/state",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const sessionId = url.searchParams.get("sessionId");
		if (!sessionId) return errorResponse("sessionId is required");
		const session = await ctx.runQuery((api as any).rpg.getSessionState, {
			sessionId,
		});
		return jsonResponse(session);
	},
});

corsRoute({
	path: "/api/rpg/sessions/action",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.sessionId) return errorResponse("sessionId is required");
		const result = await ctx.runMutation((api as any).rpg.applySessionAction, {
			sessionId: body.sessionId,
			actorId: agent.userId,
			action: body?.action ?? {},
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/sessions/end",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.sessionId) return errorResponse("sessionId is required");
		const result = await ctx.runMutation((api as any).rpg.endSession, {
			sessionId: body.sessionId,
			actorId: agent.userId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/dice/roll",
	method: "POST",
	handler: async (ctx, request) => {
		const body = await parseRequestJson(request);
		const expression =
			typeof body?.expression === "string" ? body.expression : "";
		if (!expression) return errorResponse("expression is required");

		const result = await ctx.runQuery((api as any).rpg.rollDice, {
			expression,
			seedHint: body?.seedHint,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/matchmaking/create",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldId) return errorResponse("worldId is required");

		const result = await ctx.runMutation(
			(api as any).rpg.createMatchmakingListing,
			{
				ownerId: agent.userId,
				worldId: body.worldId,
				sessionId: body?.sessionId,
				title: body?.title ?? "Open RPG Session",
				partySize: typeof body?.partySize === "number" ? body.partySize : 6,
				difficulty: body?.difficulty ?? "normal",
				agentIntensity:
					typeof body?.agentIntensity === "number" ? body.agentIntensity : 70,
				tags: Array.isArray(body?.tags) ? body.tags : [],
			},
		);
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/matchmaking/list",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit") ?? 20);
		const listings = await ctx.runQuery(
			(api as any).rpg.listMatchmakingListings,
			{ limit },
		);
		return jsonResponse({ listings });
	},
});

corsRoute({
	path: "/api/rpg/matchmaking/join",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.listingId) return errorResponse("listingId is required");
		const result = await ctx.runMutation(
			(api as any).rpg.joinMatchmakingListing,
			{
				listingId: body.listingId,
				actorId: agent.userId,
			},
		);
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/marketplace/sell",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);

		const result = await ctx.runMutation(
			(api as any).rpg.createMarketplaceItem,
			{
				ownerId: agent.userId,
				worldId: body?.worldId,
				worldVersionId: body?.worldVersionId,
				itemType: body?.itemType ?? "world",
				title: body?.title ?? "Untitled Listing",
				description: body?.description ?? "",
				priceUsdCents:
					typeof body?.priceUsdCents === "number" ? body.priceUsdCents : 0,
			},
		);

		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/marketplace/list",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit") ?? 20);
		const items = await ctx.runQuery((api as any).rpg.listMarketplaceItems, {
			limit,
		});
		return jsonResponse({ items });
	},
});

corsRoute({
	path: "/api/rpg/marketplace/buy",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.marketplaceItemId)
			return errorResponse("marketplaceItemId is required");

		const result = await ctx.runMutation((api as any).rpg.buyMarketplaceItem, {
			marketplaceItemId: body.marketplaceItemId,
			buyerId: agent.userId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/moderation/report",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.targetType || !body?.targetId || !body?.reason) {
			return errorResponse("targetType, targetId, and reason are required");
		}

		const result = await ctx.runMutation((api as any).rpg.reportModeration, {
			targetType: body.targetType,
			targetId: body.targetId,
			reporterId: agent.userId,
			reason: body.reason,
			details: body?.details,
		});
		return jsonResponse(result);
	},
});

corsRoute({
		path: "/api/rpg/moderation/review",
		method: "POST",
		handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.moderationId || !body?.status || !body?.safetyState) {
			return errorResponse(
				"moderationId, status, and safetyState are required",
			);
		}

		const result = await ctx.runMutation((api as any).rpg.reviewModeration, {
			moderationId: body.moderationId,
			reviewerId: agent.userId,
			status: body.status,
			safetyState: body.safetyState,
			resolution: body?.resolution,
		});

			return jsonResponse(result);
		},
	});

// ── Telegram Bot Helpers ────────────────────────────────────────────

type TelegramChat = {
  id?: number;
  type?: string;
};

type TelegramUser = {
  id?: number;
  username?: string;
  first_name?: string;
};

type TelegramMessage = {
  message_id?: number;
  chat?: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

type TelegramInlineKeyboardButton = {
  text: string;
  url?: string;
  callback_data?: string;
};

type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

type TelegramInlineQuery = {
  id: string;
  query?: string;
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  game_short_name?: string;
  inline_message_id?: string;
  from?: TelegramUser;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  inline_query?: TelegramInlineQuery;
  callback_query?: TelegramCallbackQuery;
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function escapeTelegramHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseTelegramMatchIdToken(raw: string): string | null {
  const token = raw.trim();
  if (!token) return null;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(token)) return null;
  return token;
}

function getTelegramDeepLink(matchId?: string): string {
  return getTelegramMiniAppDeepLink(matchId);
}

function sanitizeTelegramGameShortName(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (!/^[A-Za-z0-9_]{3,64}$/.test(value)) return null;
  return value;
}

function getTelegramGameShortName(): string | null {
  return sanitizeTelegramGameShortName(process.env.TELEGRAM_GAME_SHORT_NAME);
}

function getTelegramWebAppBaseUrl(): string | null {
  const raw = (process.env.TELEGRAM_WEB_APP_URL ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    url.search = "";
    url.pathname = "/";
    return url.toString();
  } catch {
    return null;
  }
}

function buildTelegramGameLaunchUrl(): string | null {
  const baseUrl = getTelegramWebAppBaseUrl();
  if (!baseUrl) return null;
  const url = new URL(baseUrl);
  url.pathname = "/duel";
  url.searchParams.set("source", "tg_game");
  return url.toString();
}

async function telegramApi(method: string, payload: Record<string, unknown>) {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error (${method}): ${res.status} ${body}`);
  }
  return res.json();
}

async function telegramSendMessage(
  chatId: number,
  text: string,
  replyMarkup?: TelegramInlineKeyboardMarkup,
) {
  try {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.warn("telegramSendMessage failed", error);
  }
}

async function telegramSendGame(chatId: number, gameShortName: string) {
  try {
    await telegramApi("sendGame", {
      chat_id: chatId,
      game_short_name: gameShortName,
    });
  } catch (error) {
    console.warn("telegramSendGame failed", error);
  }
}

async function telegramAnswerInlineQuery(inlineQueryId: string, results: unknown[]) {
  try {
    await telegramApi("answerInlineQuery", {
      inline_query_id: inlineQueryId,
      results,
      cache_time: 0,
      is_personal: true,
    });
  } catch (error) {
    console.warn("telegramAnswerInlineQuery failed", error);
  }
}

async function telegramAnswerCallbackQuery(
  callbackQueryId: string,
  text: string,
  showAlert = false,
) {
  try {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  } catch (error) {
    console.warn("telegramAnswerCallbackQuery failed", error);
  }
}

async function telegramAnswerCallbackQueryWithUrl(callbackQueryId: string, url: string) {
  try {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      url,
    });
  } catch (error) {
    console.warn("telegramAnswerCallbackQueryWithUrl failed", error);
  }
}

async function telegramEditCallbackMessage(
  callbackQuery: TelegramCallbackQuery,
  text: string,
  replyMarkup?: TelegramInlineKeyboardMarkup,
) {
  const inlineMessageId = callbackQuery.inline_message_id;
  const messageId = callbackQuery.message?.message_id;
  const chatId = callbackQuery.message?.chat?.id;
  if (!inlineMessageId && (!messageId || !chatId)) return;

  try {
    await telegramApi("editMessageText", {
      ...(inlineMessageId ? { inline_message_id: inlineMessageId } : { chat_id: chatId, message_id: messageId }),
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.warn("telegramEditCallbackMessage failed", error);
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

const TELEGRAM_INLINE_ACTION_TTL_MS = 5 * 60 * 1000;
const TELEGRAM_INLINE_PRIMARY_CAP = 24;
const TELEGRAM_INLINE_PAGE_SIZE = 6;

function parseRefreshPayload(raw: string): { matchId: string | null; page: number } {
  const [matchIdRaw, pageRaw] = raw.split(":", 2);
  const matchId = matchIdRaw ? parseTelegramMatchIdToken(matchIdRaw) : null;
  const page = Number(pageRaw ?? 0);
  return { matchId, page: Number.isFinite(page) ? page : 0 };
}

async function buildTelegramMatchSummary(
  ctx: { runQuery: any; runMutation?: any },
  args: { matchId: string; userId: string; page?: number },
): Promise<{ text: string; replyMarkup: TelegramInlineKeyboardMarkup }> {
  const meta = await ctx.runQuery(api.game.getMatchMeta, {
    matchId: args.matchId,
    actorUserId: args.userId,
  });
  const statusRaw = String((meta as any)?.status ?? "unknown");
  const status = statusRaw.toUpperCase();
  const mode = String((meta as any)?.mode ?? "unknown").toUpperCase();
  const winner = (meta as any)?.winner ? String((meta as any).winner).toUpperCase() : null;

  const hostId = (meta as any)?.hostId;
  const awayId = (meta as any)?.awayId;
  const seat: MatchSeat | null =
    typeof hostId === "string" && hostId === args.userId
      ? "host"
      : typeof awayId === "string" && awayId === args.userId
        ? "away"
        : null;

  const pageRequested = args.page ?? 0;

  const baseLines = [
    "<b>LunchTable Lobby</b>",
    `Match <code>${escapeTelegramHtml(args.matchId)}</code>`,
    `Mode: <b>${escapeTelegramHtml(mode)}</b>`,
    `Status: <b>${escapeTelegramHtml(status)}</b>`,
    winner ? `Winner: <b>${escapeTelegramHtml(winner)}</b>` : "",
  ];

  const defaultMarkup: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "Open Mini App", url: getTelegramDeepLink(args.matchId) }],
      [{ text: "Refresh", callback_data: `refresh:${args.matchId}:${pageRequested}` }],
    ],
  };

  // Only render interactive buttons for active matches, otherwise show the lobby controls.
  if (statusRaw !== "active" || !seat || !ctx.runMutation) {
    return { text: baseLines.filter(Boolean).join("\n"), replyMarkup: defaultMarkup };
  }

  const viewJson = await ctx.runQuery(api.game.getPlayerView, {
    matchId: args.matchId,
    seat,
    actorUserId: args.userId,
  });
  if (!viewJson || typeof viewJson !== "string") {
    return { text: baseLines.filter(Boolean).join("\n"), replyMarkup: defaultMarkup };
  }

  const view: Record<string, unknown> | null = (() => {
    try {
      const parsed = JSON.parse(viewJson) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (!view) {
    return { text: baseLines.filter(Boolean).join("\n"), replyMarkup: defaultMarkup };
  }

  const openPromptRow = await ctx.runQuery(api.game.getOpenPrompt, {
    matchId: args.matchId,
    seat,
    actorUserId: args.userId,
  });
  const openPromptData: unknown = (() => {
    const raw = openPromptRow ? (openPromptRow as any).data : null;
    if (typeof raw !== "string") return raw;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  })();

  const definitionIds = new Set<string>();
  const hand = Array.isArray(view.hand) ? view.hand : [];
  for (const entry of hand) {
    if (typeof entry === "string") definitionIds.add(entry);
  }

  const board = Array.isArray(view.board) ? view.board : [];
  for (const entry of board) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const defId =
      typeof (entry as any).definitionId === "string"
        ? (entry as any).definitionId
        : typeof (entry as any).cardId === "string"
          ? (entry as any).cardId
          : null;
    if (defId) definitionIds.add(defId);
  }

  const spellTrapZone = Array.isArray(view.spellTrapZone) ? view.spellTrapZone : [];
  for (const entry of spellTrapZone) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const defId =
      typeof (entry as any).definitionId === "string"
        ? (entry as any).definitionId
        : typeof (entry as any).cardId === "string"
          ? (entry as any).cardId
          : null;
    if (defId) definitionIds.add(defId);
  }

  if (view.fieldSpell && typeof view.fieldSpell === "object" && !Array.isArray(view.fieldSpell)) {
    const defId =
      typeof (view.fieldSpell as any).definitionId === "string"
        ? (view.fieldSpell as any).definitionId
        : typeof (view.fieldSpell as any).cardId === "string"
          ? (view.fieldSpell as any).cardId
          : null;
    if (defId) definitionIds.add(defId);
  }

  const cardMetaById = new Map<string, { type: string; level: number }>();
  if (definitionIds.size > 0) {
    const cardsBatch = await ctx.runQuery(api.cards.getCardsBatch, {
      cardIds: Array.from(definitionIds),
    });

    if (Array.isArray(cardsBatch)) {
      for (const card of cardsBatch) {
        if (!card || typeof card !== "object") continue;
        const id = (card as any)._id;
        if (typeof id !== "string") continue;
        const typeRaw = (card as any).type ?? (card as any).cardType;
        const levelRaw = (card as any).level;
        cardMetaById.set(id, {
          type: typeof typeRaw === "string" ? typeRaw : String(typeRaw ?? ""),
          level: typeof levelRaw === "number" && Number.isFinite(levelRaw) ? levelRaw : 0,
        });
      }
    }
  }

  // Some view payloads use stable definition IDs for hand and definitionId, but instance IDs for cardId.
  // Mirror meta across both so derived actions can resolve either key.
  for (const entry of [...board, ...spellTrapZone]) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const cardId = typeof (entry as any).cardId === "string" ? (entry as any).cardId : null;
    const defId = typeof (entry as any).definitionId === "string" ? (entry as any).definitionId : null;
    if (!cardId || !defId) continue;
    const metaForDef = cardMetaById.get(defId);
    if (metaForDef) cardMetaById.set(cardId, metaForDef);
  }

  const primaryCommands = deriveInlinePrimaryCommands({
    view,
    cardMetaById,
    seat,
    openPromptData,
  }).slice(0, TELEGRAM_INLINE_PRIMARY_CAP);

  const { page, totalPages, items: pageCommands } = paginateInlineCommands(
    primaryCommands,
    pageRequested,
    TELEGRAM_INLINE_PAGE_SIZE,
  );

  const expiresAt = Date.now() + TELEGRAM_INLINE_ACTION_TTL_MS;
  const primaryButtons = await Promise.all(
    pageCommands.map(async (action) => {
      const token = await ctx.runMutation(internalApi.telegram.createTelegramActionToken, {
        matchId: args.matchId,
        seat,
        commandJson: JSON.stringify(action.command),
        expiresAt,
      });
      return { text: action.label, callback_data: `act:${token}` } satisfies TelegramInlineKeyboardButton;
    }),
  );

  const fallbackCommands = fallbackInlineCommands();
  const fallbackButtons = await Promise.all(
    fallbackCommands.map(async (action) => {
      const token = await ctx.runMutation(internalApi.telegram.createTelegramActionToken, {
        matchId: args.matchId,
        seat,
        commandJson: JSON.stringify(action.command),
        expiresAt,
      });
      return { text: action.label, callback_data: `act:${token}` } satisfies TelegramInlineKeyboardButton;
    }),
  );

  const inline_keyboard: TelegramInlineKeyboardButton[][] = [];
  for (let i = 0; i < primaryButtons.length; i += 2) {
    inline_keyboard.push(primaryButtons.slice(i, i + 2));
  }

  if (totalPages > 1) {
    const navRow: TelegramInlineKeyboardButton[] = [];
    if (page > 0) navRow.push({ text: "Prev", callback_data: `refresh:${args.matchId}:${page - 1}` });
    navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: `refresh:${args.matchId}:${page}` });
    if (page < totalPages - 1) navRow.push({ text: "Next", callback_data: `refresh:${args.matchId}:${page + 1}` });
    inline_keyboard.push(navRow);
  }

  if (fallbackButtons.length > 0) {
    inline_keyboard.push(fallbackButtons);
  }
  inline_keyboard.push([{ text: "Open Mini App", url: getTelegramDeepLink(args.matchId) }]);
  inline_keyboard.push([{ text: "Refresh", callback_data: `refresh:${args.matchId}:${page}` }]);

  const phaseRaw = typeof view.currentPhase === "string" ? view.currentPhase : null;
  const turnRaw = typeof view.currentTurnPlayer === "string" ? view.currentTurnPlayer : null;
  const lp = typeof view.lifePoints === "number" && Number.isFinite(view.lifePoints) ? view.lifePoints : null;
  const oppLp =
    typeof view.opponentLifePoints === "number" && Number.isFinite(view.opponentLifePoints)
      ? view.opponentLifePoints
      : null;

  const lines = [
    "<b>LunchTable Duel</b>",
    `Match <code>${escapeTelegramHtml(args.matchId)}</code>`,
    `Seat: <b>${escapeTelegramHtml(seat.toUpperCase())}</b>`,
    `Phase: <b>${escapeTelegramHtml(String(phaseRaw ?? "?").toUpperCase())}</b>`,
    turnRaw ? `Turn: <b>${escapeTelegramHtml(String(turnRaw).toUpperCase())}</b>` : "",
    lp !== null && oppLp !== null ? `LP: <b>${lp}</b> vs <b>${oppLp}</b>` : "",
    totalPages > 1 ? `Actions: <b>${page + 1}/${totalPages}</b>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { text: lines, replyMarkup: { inline_keyboard } };

}

async function requireLinkedTelegramUser(
  ctx: { runQuery: any },
  callbackQuery: TelegramCallbackQuery,
) {
  const telegramUserId = callbackQuery.from?.id ? String(callbackQuery.from.id) : null;
  if (!telegramUserId) {
    throw new Error("Missing Telegram identity.");
  }

  const userId = await ctx.runQuery(internalApi.telegram.findLinkedUserByTelegramId, {
    telegramUserId,
  });
  if (!userId) {
    throw new Error("Telegram account not linked. Open the Mini App to link your account first.");
  }

  return { userId: String(userId) };
}

	async function handleTelegramStartMessage(
	  ctx: { runMutation: any },
	  message: TelegramMessage,
	) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  const text = (message.text ?? "").trim();
  const payload = text.split(/\s+/, 2)[1] ?? "";
  const matchId = payload.startsWith("m_") ? parseTelegramMatchIdToken(payload.slice(2)) : null;

  if (message.from?.id) {
    await ctx.runMutation(internalApi.telegram.touchTelegramIdentity, {
      telegramUserId: String(message.from.id),
      username: message.from.username,
      firstName: message.from.first_name,
      privateChatId: message.chat?.type === "private" ? String(chatId) : undefined,
    });
  }

  const intro = [
    "<b>LunchTable Telegram</b>",
    "Open the Mini App to link your account and play full matches.",
    matchId ? `Match requested: <code>${escapeTelegramHtml(matchId)}</code>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const keyboard: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "Open Mini App", url: getTelegramDeepLink(matchId ?? undefined) }],
      ...(matchId ? [[{ text: "Join Lobby Inline", callback_data: `join_lobby:${matchId}` }]] : []),
    ],
  };

  await telegramSendMessage(chatId, intro, keyboard);
}

async function handleTelegramInlineQuery(
  inlineQuery: TelegramInlineQuery,
) {
  const queryText = (inlineQuery.query ?? "").trim();
  const requestedMatchId = parseTelegramMatchIdToken(queryText);
  const results: unknown[] = [];
  const openMiniAppButton = { text: "Open Mini App", url: getTelegramDeepLink() };
  const gameShortName = getTelegramGameShortName();

  if (gameShortName) {
    results.push({
      type: "game",
      id: "play_game",
      game_short_name: gameShortName,
    });
  }

  results.push({
    type: "article",
    id: "create_lobby",
    title: "Create PvP Lobby",
    description: "Create a waiting PvP match from inline chat.",
    input_message_content: {
      message_text: "Create a LunchTable PvP lobby:",
    },
    reply_markup: {
      inline_keyboard: [
        [{ text: "Create Lobby", callback_data: "create_lobby" }],
        [openMiniAppButton],
      ],
    },
  });

  if (requestedMatchId) {
    results.push({
      type: "article",
      id: `join_${requestedMatchId}`,
      title: `Join Lobby ${requestedMatchId}`,
      description: "Join an existing waiting PvP lobby.",
      input_message_content: {
        message_text: `Join LunchTable lobby <code>${escapeTelegramHtml(requestedMatchId)}</code>`,
        parse_mode: "HTML",
      },
      reply_markup: {
        inline_keyboard: [
          [{ text: "Join Lobby", callback_data: `join_lobby:${requestedMatchId}` }],
          [openMiniAppButton],
        ],
      },
    });
  }

  results.push({
    type: "article",
    id: "open_miniapp",
    title: "Open Mini App",
    description: "Launch LunchTable Mini App in Telegram.",
    input_message_content: {
      message_text: "Open LunchTable Mini App:",
    },
    reply_markup: {
      inline_keyboard: [[openMiniAppButton]],
    },
  });

  await telegramAnswerInlineQuery(inlineQuery.id, results);
}

async function handleTelegramCallbackQuery(
  ctx: { runMutation: any; runQuery: any },
  callbackQuery: TelegramCallbackQuery,
) {
  const configuredGame = getTelegramGameShortName();
  const requestedGame = sanitizeTelegramGameShortName(callbackQuery.game_short_name);
  if (requestedGame) {
    const launchUrl = buildTelegramGameLaunchUrl();
    if (!configuredGame || requestedGame !== configuredGame) {
      await telegramAnswerCallbackQuery(callbackQuery.id, "Unsupported game.");
      return;
    }
    if (!launchUrl) {
      await telegramAnswerCallbackQuery(callbackQuery.id, "Game URL not configured.", true);
      return;
    }
    await telegramAnswerCallbackQueryWithUrl(callbackQuery.id, launchUrl);
    return;
  }

  const data = (callbackQuery.data ?? "").trim();
  if (!data) {
    await telegramAnswerCallbackQuery(callbackQuery.id, "No callback payload.");
    return;
  }

  if (data.startsWith("refresh:")) {
    try {
      const { userId } = await requireLinkedTelegramUser(ctx, callbackQuery);
      const { matchId, page } = parseRefreshPayload(data.slice("refresh:".length));
      if (!matchId) throw new Error("Invalid match id.");
      const summary = await buildTelegramMatchSummary(ctx, { matchId, userId, page });
      await telegramEditCallbackMessage(callbackQuery, summary.text, summary.replyMarkup);
      await telegramAnswerCallbackQuery(callbackQuery.id, "Refreshed.");
    } catch (error: any) {
      await telegramAnswerCallbackQuery(callbackQuery.id, error?.message ?? "Refresh failed.", true);
    }
    return;
  }

  if (data === "create_lobby") {
    try {
      const { userId } = await requireLinkedTelegramUser(ctx, callbackQuery);
      const result = await ctx.runMutation(internalApi.game.createPvpLobbyForUser, {
        userId,
        client: "telegram",
        source: "telegram-inline",
      });
      const summary = await buildTelegramMatchSummary(ctx, { matchId: result.matchId, userId });
      await telegramEditCallbackMessage(callbackQuery, summary.text, summary.replyMarkup);
      await telegramAnswerCallbackQuery(callbackQuery.id, "Lobby ready.");
    } catch (error: any) {
      await telegramAnswerCallbackQuery(callbackQuery.id, error?.message ?? "Failed to create lobby.", true);
    }
    return;
  }

  if (data.startsWith("join_lobby:")) {
    try {
      const { userId } = await requireLinkedTelegramUser(ctx, callbackQuery);
      const matchId = parseTelegramMatchIdToken(data.slice("join_lobby:".length));
      if (!matchId) throw new Error("Invalid match id.");
      await ctx.runMutation(internalApi.game.joinPvpLobbyForUser, {
        userId,
        matchId,
        client: "telegram",
        source: "telegram-inline",
      });
      const summary = await buildTelegramMatchSummary(ctx, { matchId, userId });
      await telegramEditCallbackMessage(callbackQuery, summary.text, summary.replyMarkup);
      await telegramAnswerCallbackQuery(callbackQuery.id, "Joined match.");
    } catch (error: any) {
      await telegramAnswerCallbackQuery(callbackQuery.id, error?.message ?? "Failed to join.", true);
    }
    return;
  }

  if (data.startsWith("act:")) {
    try {
      const { userId } = await requireLinkedTelegramUser(ctx, callbackQuery);
      const token = data.slice("act:".length);
      const tokenPayload = await ctx.runQuery(internalApi.telegram.getTelegramActionToken, {
        token,
      });
      if (!tokenPayload) {
        throw new Error("Action expired. Refresh the controls.");
      }
      if (tokenPayload.expiresAt < Date.now()) {
        await ctx.runMutation(internalApi.telegram.deleteTelegramActionToken, { token });
        throw new Error("Action token expired. Refresh and try again.");
      }

      const meta = await ctx.runQuery(api.game.getMatchMeta, { matchId: tokenPayload.matchId });
      if (!meta) {
        throw new Error("Match not found.");
      }
      const seatOwner = tokenPayload.seat === "host" ? meta.hostId : meta.awayId;
      if (seatOwner !== userId) {
        throw new Error("You are not authorized to execute this action.");
      }

      const command = parseJsonObject(tokenPayload.commandJson);
      if (!command) throw new Error("Action payload is invalid.");

      await ctx.runMutation(internalApi.game.submitActionWithClientForUser, {
        userId,
        matchId: tokenPayload.matchId,
        command: JSON.stringify(command),
        seat: tokenPayload.seat,
        expectedVersion: tokenPayload.expectedVersion ?? undefined,
        client: "telegram",
      });
      await ctx.runMutation(internalApi.telegram.deleteTelegramActionToken, { token });

      const summary = await buildTelegramMatchSummary(ctx, {
        matchId: tokenPayload.matchId,
        userId,
      });
      await telegramEditCallbackMessage(callbackQuery, summary.text, summary.replyMarkup);
      await telegramAnswerCallbackQuery(callbackQuery.id, "Action submitted.");
    } catch (error: any) {
      await telegramAnswerCallbackQuery(callbackQuery.id, error?.message ?? "Action failed.", true);
    }
    return;
  }

  await telegramAnswerCallbackQuery(callbackQuery.id, "Unsupported action.");
}

async function handleTelegramUpdate(
  ctx: { runMutation: any; runQuery: any },
  update: TelegramUpdate,
) {
  if (update.message?.text) {
    const text = update.message.text.trim();
    const head = text.split(/\s+/, 1)[0] ?? "";
    const command = head.split("@", 1)[0] ?? "";

    if (command === "/start") {
      await handleTelegramStartMessage(ctx, update.message);
      return;
    }

    if (command === "/game") {
      const chatId = update.message.chat?.id;
      if (!chatId) return;

      if (update.message.from?.id) {
        await ctx.runMutation(internalApi.telegram.touchTelegramIdentity, {
          telegramUserId: String(update.message.from.id),
          username: update.message.from.username,
          firstName: update.message.from.first_name,
          privateChatId: update.message.chat?.type === "private" ? String(chatId) : undefined,
        });
      }

      const gameShortName = getTelegramGameShortName();
      if (gameShortName) {
        await telegramSendGame(chatId, gameShortName);
      } else {
        await telegramSendMessage(
          chatId,
          "<b>LunchTable</b>\nGame is not configured yet. Open the Mini App instead.",
          {
            inline_keyboard: [[{ text: "Open Mini App", url: getTelegramDeepLink() }]],
          },
        );
      }
      return;
    }
  }

  if (update.inline_query) {
    await handleTelegramInlineQuery(update.inline_query);
    return;
  }

  if (update.callback_query) {
    await handleTelegramCallbackQuery(ctx, update.callback_query);
  }
}

http.route({
  path: "/api/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const configuredSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
    const receivedSecret = (request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "").trim();
    if (!configuredSecret || !timingSafeEqual(configuredSecret, receivedSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: TelegramUpdate;
    try {
      payload = (await request.json()) as TelegramUpdate;
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const updateId = typeof payload.update_id === "number" ? payload.update_id : null;
    if (updateId !== null) {
      const alreadyProcessed = await ctx.runQuery(internalApi.telegram.hasProcessedTelegramUpdate, {
        updateId,
      });
      if (alreadyProcessed) {
        return jsonResponse({ ok: true, duplicate: true });
      }
    }

    try {
      await handleTelegramUpdate(ctx, payload);
      if (updateId !== null) {
        await ctx.runMutation(internalApi.telegram.markTelegramUpdateProcessed, { updateId });
      }
      return jsonResponse({ ok: true });
    } catch (error: any) {
      console.error("telegram_webhook_error", error);
      return errorResponse(error?.message ?? "Webhook processing failed.", 500);
    }
  }),
});

export default http;
