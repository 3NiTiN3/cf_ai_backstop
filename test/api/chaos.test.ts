import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { isAdmin } from "../../src/api/auth";

const ADMIN = "test-admin-token";
const URL_BASE = "http://backstop.test/api/chaos";

function post(body: unknown, headers: HeadersInit = {}): Promise<Response> {
  return exports.default.fetch(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function message(response: Response): Promise<string> {
  const body: { message: string } = await response.json();
  return body.message;
}

describe("demo namespace", () => {
  it("is open and fills in defaults for the chosen mode", async () => {
    const response = await post({ namespace: "demo", mode: "errors" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      namespace: "demo",
      mode: "errors",
      errorRate: 0.5,
      latencyMs: 0,
    });

    const current = await exports.default.fetch(`${URL_BASE}?namespace=demo`);
    expect(await current.json()).toMatchObject({ mode: "errors" });
  });

  it("ignores settings that do not apply to the mode", async () => {
    const response = await post({
      namespace: "demo",
      mode: "latency",
      latencyMs: 250,
      errorRate: 1,
    });
    expect(await response.json()).toMatchObject({
      mode: "latency",
      latencyMs: 250,
      errorRate: 0,
    });
  });
});

describe("live namespace", () => {
  it("rejects missing and wrong tokens", async () => {
    const body = { namespace: "live", mode: "blackout" };
    const missing = await post(body);
    expect(missing.status).toBe(401);
    expect(await message(missing)).toMatch(/admin token/);

    const wrong = await post(body, { authorization: "Bearer nope" });
    expect(wrong.status).toBe(401);
    await wrong.body?.cancel();

    const current = await exports.default.fetch(`${URL_BASE}?namespace=live`);
    expect(await current.json()).toMatchObject({ mode: "off" });
  });

  it("accepts the admin token", async () => {
    const response = await post(
      { namespace: "live", mode: "blackout" },
      { authorization: `Bearer ${ADMIN}` },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      namespace: "live",
      mode: "blackout",
    });
  });
});

describe("validation", () => {
  it.each([
    [{ namespace: "demo", mode: "meltdown" }, /^mode: /],
    [{ namespace: "demo", mode: "errors", errorRate: 2 }, /^errorRate: /],
    [{ namespace: "demo", mode: "latency", latencyMs: 60_000 }, /^latencyMs: /],
    [{ mode: "off" }, /^namespace: /],
    [{ namespace: "demo", mode: "off", extra: true }, /extra/],
  ])("rejects %j with a clear message", async (body, expected) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await message(response)).toMatch(expected);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await post("{nope");
    expect(response.status).toBe(400);
    expect(await message(response)).toBe("Body must be valid JSON");
  });

  it("rejects an unknown namespace in the query", async () => {
    const response = await exports.default.fetch(`${URL_BASE}?namespace=x`);
    expect(response.status).toBe(400);
    await response.body?.cancel();
  });

  it("rejects other methods", async () => {
    const response = await exports.default.fetch(URL_BASE, { method: "PUT" });
    expect(response.status).toBe(405);
    await response.body?.cancel();
  });
});

describe("body size limit", () => {
  it("rejects a declared body over 16 KB", async () => {
    const response = await post("x".repeat(16 * 1024 + 1));
    expect(response.status).toBe(413);
    await response.body?.cancel();
  });

  it("rejects a streamed body over 16 KB without Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(8 * 1024));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 3; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const response = await exports.default.fetch(URL_BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
    });
    expect(response.status).toBe(413);
    await response.body?.cancel();
  });
});

describe("isAdmin", () => {
  const withAuth = (value: string) =>
    new Request("http://x/", { headers: { authorization: value } });

  it("accepts the scheme in any case", async () => {
    expect(await isAdmin(withAuth(`bearer ${ADMIN}`), ADMIN)).toBe(true);
  });

  it("denies everyone when no admin token is configured", async () => {
    expect(await isAdmin(withAuth("Bearer "), "")).toBe(false);
    expect(await isAdmin(withAuth("Bearer x"), undefined)).toBe(false);
  });

  it("denies other schemes and near misses", async () => {
    expect(await isAdmin(withAuth(`token ${ADMIN}`), ADMIN)).toBe(false);
    expect(await isAdmin(withAuth(`Bearer ${ADMIN}x`), ADMIN)).toBe(false);
  });
});
