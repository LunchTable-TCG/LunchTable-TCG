const SIGNUP_AVATAR_COUNT = 29;

export const VALID_SIGNUP_AVATAR_PATHS = new Set(
  Array.from({ length: SIGNUP_AVATAR_COUNT }, (_, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return `avatars/signup/avatar-${suffix}.png`;
  }),
);

/**
 * Accept either the canonical stored path (`avatars/signup/avatar-001.png`) or a full URL
 * containing the canonical path somewhere in its pathname. Returns the canonical path.
 */
export function normalizeSignupAvatarPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (VALID_SIGNUP_AVATAR_PATHS.has(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const suffixMatch = url.pathname.match(/\/avatars\/signup\/avatar-\d{3}\.png$/);
    if (suffixMatch) {
      const candidate = suffixMatch[0].replace(/^\//, "");
      if (VALID_SIGNUP_AVATAR_PATHS.has(candidate)) return candidate;
    }

    const idx = url.pathname.indexOf("/avatars/signup/");
    if (idx !== -1) {
      const candidate = url.pathname.slice(idx + 1);
      if (VALID_SIGNUP_AVATAR_PATHS.has(candidate)) return candidate;
    }
  } catch {
    // ignore invalid URLs
  }

  return null;
}

export function isValidSignupAvatarPath(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  return normalizeSignupAvatarPath(raw) !== null;
}

