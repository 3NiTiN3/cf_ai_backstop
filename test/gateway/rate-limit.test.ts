import { describe, expect, it } from "vitest";
import { signalOf } from "../../src/gateway/rate-limit";
import { okResult } from "./helpers";

const NOW = 1_700_000_000_000;
const FALLBACK = 30_000;

describe("signalOf", () => {
  it("reports nothing for a healthy response", () => {
    expect(signalOf(okResult("{}"), NOW, FALLBACK)).toEqual({
      failed: false,
      rateLimitResetAt: null,
    });
  });

  it("marks server errors as failures without a rate limit", () => {
    const result = okResult("", { status: 502, outcome: "server_error" });
    expect(signalOf(result, NOW, FALLBACK)).toEqual({
      failed: true,
      rateLimitResetAt: null,
    });
  });

  it("uses retry-after seconds", () => {
    const result = okResult("", {
      status: 429,
      outcome: "rate_limited",
      headers: { "retry-after": "12" },
    });
    expect(signalOf(result, NOW, FALLBACK)).toEqual({
      failed: true,
      rateLimitResetAt: NOW + 12_000,
    });
  });

  it("uses a retry-after HTTP date", () => {
    const when = new Date(NOW + 60_000).toUTCString();
    const result = okResult("", {
      status: 503,
      outcome: "server_error",
      headers: { "retry-after": when },
    });
    expect(signalOf(result, NOW, FALLBACK).rateLimitResetAt).toBe(
      Date.parse(when),
    );
  });

  it("uses x-ratelimit-reset when the quota is spent on a successful call", () => {
    const result = okResult("{}", {
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String((NOW + 90_000) / 1000),
      },
    });
    expect(signalOf(result, NOW, FALLBACK)).toEqual({
      failed: false,
      rateLimitResetAt: NOW + 90_000,
    });
  });

  it("falls back to the default duration for a bare 429", () => {
    const result = okResult("", { status: 429, outcome: "rate_limited" });
    expect(signalOf(result, NOW, FALLBACK).rateLimitResetAt).toBe(
      NOW + FALLBACK,
    );
  });

  it("ignores a quota that is not yet spent", () => {
    const result = okResult("{}", {
      headers: { "x-ratelimit-remaining": "1", "x-ratelimit-reset": "99" },
    });
    expect(signalOf(result, NOW, FALLBACK).rateLimitResetAt).toBeNull();
  });
});
