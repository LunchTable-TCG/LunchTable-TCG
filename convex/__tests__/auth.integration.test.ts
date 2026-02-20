/// <reference types="vite/client" />
import { expect, test, describe } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "../_generated/api";
import { setupTestConvex, seedUser, ALICE, BOB } from "./setup.test-helpers";

// ═══════════════════════════════════════════════════════════════════════
// auth.ts integration tests
// Exercises: syncUser, currentUser, setUsername, setAvatarPath,
//            getOnboardingStatus
// ═══════════════════════════════════════════════════════════════════════

describe("syncUser", () => {
  test("creates a new user with auto-generated username", async () => {
    const t = setupTestConvex();
    const asAlice = t.withIdentity(ALICE);

    const userId = await asAlice.mutation(api.auth.syncUser, {});
    expect(userId).toBeTruthy();

    // Verify user exists in DB
    const user = await asAlice.query(api.auth.currentUser, {});
    expect(user).not.toBeNull();
    expect(user.privyId).toBe("privy:alice-001");
    expect(user.username).toMatch(/^player_\d+$/);
  });

  test("re-syncing updates email without creating a duplicate", async () => {
    const t = setupTestConvex();
    const asAlice = t.withIdentity(ALICE);

    const id1 = await asAlice.mutation(api.auth.syncUser, {
      email: "alice@test.com",
    });
    const id2 = await asAlice.mutation(api.auth.syncUser, {
      email: "alice-new@test.com",
    });
    // Same user document returned
    expect(id1).toBe(id2);

    // Email was updated
    const user = await asAlice.query(api.auth.currentUser, {});
    expect(user.email).toBe("alice-new@test.com");
  });

  test("throws when called without authentication", async () => {
    const t = setupTestConvex();
    await expect(
      t.mutation(api.auth.syncUser, {}),
    ).rejects.toThrow();
  });
});

describe("currentUser", () => {
  test("returns null when not authenticated", async () => {
    const t = setupTestConvex();
    const result = await t.query(api.auth.currentUser, {});
    expect(result).toBeNull();
  });

  test("returns null for authenticated user who hasn't synced yet", async () => {
    const t = setupTestConvex();
    const asAlice = t.withIdentity(ALICE);
    // Authenticated but no user row in DB
    const result = await asAlice.query(api.auth.currentUser, {});
    expect(result).toBeNull();
  });

  test("returns user after syncUser", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    const user = await asAlice.query(api.auth.currentUser, {});
    expect(user).not.toBeNull();
    expect(user.privyId).toBe(ALICE.subject);
  });
});

describe("setUsername", () => {
  test("accepts a valid username", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    const result = await asAlice.mutation(api.auth.setUsername, {
      username: "cool_alice",
    });
    expect(result).toEqual({ success: true });

    const user = await asAlice.query(api.auth.currentUser, {});
    expect(user.username).toBe("cool_alice");
  });

  test("rejects username shorter than 3 characters", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    await expect(
      asAlice.mutation(api.auth.setUsername, { username: "ab" }),
    ).rejects.toThrow();
  });

  test("rejects username with special characters", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    await expect(
      asAlice.mutation(api.auth.setUsername, { username: "no spaces" }),
    ).rejects.toThrow();
  });

  test("rejects username longer than 20 characters", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    await expect(
      asAlice.mutation(api.auth.setUsername, {
        username: "a".repeat(21),
      }),
    ).rejects.toThrow();
  });

  test("rejects duplicate username taken by another user", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    await asAlice.mutation(api.auth.setUsername, { username: "taken_name" });

    await expect(
      asBob.mutation(api.auth.setUsername, { username: "taken_name" }),
    ).rejects.toThrow();
  });

  test("allows same user to re-set their own username", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    await asAlice.mutation(api.auth.setUsername, { username: "first_name" });
    const result = await asAlice.mutation(api.auth.setUsername, {
      username: "first_name",
    });
    expect(result).toEqual({ success: true });
  });
});

describe("setAvatarPath", () => {
  test("accepts a valid signup avatar path", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    const result = await asAlice.mutation(api.auth.setAvatarPath, {
      avatarPath: "avatars/signup/avatar-001.png",
    });
    expect(result.success).toBe(true);
    expect(result.avatarPath).toBe("avatars/signup/avatar-001.png");
  });

  test("rejects an invalid avatar path", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    await expect(
      asAlice.mutation(api.auth.setAvatarPath, {
        avatarPath: "not/a/valid/path.png",
      }),
    ).rejects.toThrow();
  });

  test("rejects empty string", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    await expect(
      asAlice.mutation(api.auth.setAvatarPath, { avatarPath: "" }),
    ).rejects.toThrow();
  });
});

describe("getOnboardingStatus", () => {
  test("returns null when not authenticated", async () => {
    const t = setupTestConvex();
    const result = await t.query(api.auth.getOnboardingStatus, {});
    expect(result).toBeNull();
  });

  test("returns exists:false for authenticated user without DB row", async () => {
    const t = setupTestConvex();
    const asAlice = t.withIdentity(ALICE);
    const status = await asAlice.query(api.auth.getOnboardingStatus, {});
    expect(status).toMatchObject({
      exists: false,
      hasUsername: false,
      hasAvatar: false,
      hasStarterDeck: false,
    });
  });

  test("detects fresh user has no username/avatar/deck", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    const status = await asAlice.query(api.auth.getOnboardingStatus, {});
    expect(status).toMatchObject({
      exists: true,
      hasUsername: false, // auto-generated "player_..." isn't a real username
      hasAvatar: false,
      hasStarterDeck: false,
    });
  });

  test("detects username set after setUsername", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    await asAlice.mutation(api.auth.setUsername, { username: "real_name" });

    const status = await asAlice.query(api.auth.getOnboardingStatus, {});
    expect(status!.hasUsername).toBe(true);
  });

  test("detects avatar set after setAvatarPath", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);
    await asAlice.mutation(api.auth.setAvatarPath, {
      avatarPath: "avatars/signup/avatar-005.png",
    });

    const status = await asAlice.query(api.auth.getOnboardingStatus, {});
    expect(status!.hasAvatar).toBe(true);
  });
});
