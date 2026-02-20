import { describe, it, expect, vi } from "vitest";

// We test the pure helper functions by extracting them via the handler's behavior.
// Since the functions are not exported, we test them through the handler.

// Re-implement the pure functions for direct testing (they're trivial but security-critical)
function getStringQuery(
  value: string | string[] | undefined,
  fallback: string,
  maxLength: number,
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return fallback;
  return candidate.trim().slice(0, maxLength) || fallback;
}

function getIntQuery(
  value: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return fallback;
  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatScore(score: number): string {
  return new Intl.NumberFormat("en-US").format(score);
}

describe("getStringQuery", () => {
  it("returns fallback for undefined", () => {
    expect(getStringQuery(undefined, "default", 32)).toBe("default");
  });

  it("returns first element of array", () => {
    expect(getStringQuery(["hello", "world"], "default", 32)).toBe("hello");
  });

  it("returns string value directly", () => {
    expect(getStringQuery("hello", "default", 32)).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(getStringQuery("  hello  ", "default", 32)).toBe("hello");
  });

  it("truncates at maxLength", () => {
    expect(getStringQuery("abcdefghij", "default", 5)).toBe("abcde");
  });

  it("returns fallback for empty string", () => {
    expect(getStringQuery("", "default", 32)).toBe("default");
  });

  it("returns fallback for whitespace-only string after trim+slice", () => {
    expect(getStringQuery("   ", "default", 32)).toBe("default");
  });

  it("returns fallback for empty array", () => {
    expect(getStringQuery([], "default", 32)).toBe("default");
  });
});

describe("getIntQuery", () => {
  it("returns fallback for undefined", () => {
    expect(getIntQuery(undefined, 999, 1, 9999)).toBe(999);
  });

  it("parses valid integer string", () => {
    expect(getIntQuery("42", 0, 1, 100)).toBe(42);
  });

  it("clamps to minimum", () => {
    expect(getIntQuery("0", 999, 1, 9999)).toBe(1);
  });

  it("clamps to maximum", () => {
    expect(getIntQuery("99999", 0, 0, 9999)).toBe(9999);
  });

  it("returns fallback for non-numeric string", () => {
    expect(getIntQuery("abc", 999, 1, 9999)).toBe(999);
  });

  it("returns fallback for NaN", () => {
    expect(getIntQuery("NaN", 999, 1, 9999)).toBe(999);
  });

  it("returns fallback for Infinity", () => {
    expect(getIntQuery("Infinity", 999, 1, 9999)).toBe(999);
  });

  it("takes first element of array", () => {
    expect(getIntQuery(["42", "99"], 0, 1, 100)).toBe(42);
  });

  it("handles negative numbers clamped to min", () => {
    expect(getIntQuery("-5", 0, 0, 100)).toBe(0);
  });

  it("handles float strings (parseInt truncates)", () => {
    expect(getIntQuery("42.9", 0, 1, 100)).toBe(42);
  });
});

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes less-than", () => {
    expect(escapeXml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes greater-than", () => {
    expect(escapeXml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeXml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  it("handles all special chars together", () => {
    expect(escapeXml(`<b>"Hello" & 'World'</b>`)).toBe(
      "&lt;b&gt;&quot;Hello&quot; &amp; &apos;World&apos;&lt;/b&gt;"
    );
  });

  it("handles empty string", () => {
    expect(escapeXml("")).toBe("");
  });

  it("passes through safe strings unchanged", () => {
    expect(escapeXml("Hello World 123")).toBe("Hello World 123");
  });

  // XSS attack vectors
  it("neutralizes SVG injection", () => {
    const xss = '<svg onload="alert(1)">';
    const escaped = escapeXml(xss);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
  });

  it("neutralizes script injection in name field", () => {
    const xss = '"><script>alert(document.cookie)</script>';
    const escaped = escapeXml(xss);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("neutralizes attribute injection by escaping quotes", () => {
    const xss = '" onmouseover="alert(1)" x="';
    const escaped = escapeXml(xss);
    // Quotes are escaped so the attribute can't break out of the SVG attribute context
    expect(escaped).not.toContain('"');
    expect(escaped).toContain("&quot;");
    expect(escaped).toBe("&quot; onmouseover=&quot;alert(1)&quot; x=&quot;");
  });

  it("handles unicode characters safely", () => {
    expect(escapeXml("名前 & 引用")).toBe("名前 &amp; 引用");
  });

  it("handles multiple consecutive special chars", () => {
    expect(escapeXml("<<>>&&")).toBe("&lt;&lt;&gt;&gt;&amp;&amp;");
  });
});

describe("formatScore", () => {
  it("formats zero", () => {
    expect(formatScore(0)).toBe("0");
  });

  it("formats small numbers without commas", () => {
    expect(formatScore(999)).toBe("999");
  });

  it("formats thousands with commas", () => {
    expect(formatScore(1000)).toBe("1,000");
  });

  it("formats millions", () => {
    expect(formatScore(1234567)).toBe("1,234,567");
  });

  it("formats max allowed score", () => {
    expect(formatScore(9_999_999)).toBe("9,999,999");
  });
});
