import { describe, expect, it } from "vitest";
import { normalizeSignupAvatarPath } from "./signupAvatar";

describe("normalizeSignupAvatarPath", () => {
  it("accepts canonical signup avatar paths", () => {
    expect(normalizeSignupAvatarPath("avatars/signup/avatar-001.png")).toBe(
      "avatars/signup/avatar-001.png",
    );
    expect(normalizeSignupAvatarPath(" avatars/signup/avatar-029.png ")).toBe(
      "avatars/signup/avatar-029.png",
    );
  });

  it("extracts canonical paths from URLs", () => {
    expect(
      normalizeSignupAvatarPath(
        "https://example.com/lunchtable/lunchtable/avatars/signup/avatar-002.png",
      ),
    ).toBe("avatars/signup/avatar-002.png");

    expect(
      normalizeSignupAvatarPath(
        "https://example.com/avatars/signup/avatar-003.png?cache=bust#frag",
      ),
    ).toBe("avatars/signup/avatar-003.png");
  });

  it("rejects unknown avatars", () => {
    expect(normalizeSignupAvatarPath("avatars/signup/avatar-999.png")).toBe(null);
    expect(
      normalizeSignupAvatarPath(
        "https://example.com/avatars/signup/avatar-999.png",
      ),
    ).toBe(null);
  });
});

