import { describe, expect, it } from "vitest";
import { handleMockRequest } from "../../src/mock/github";

const noDelay = { latencyMs: () => 0 };

function get(path: string, headers: HeadersInit = {}) {
  return handleMockRequest(
    new Request(`https://mock.test${path}`, { headers }),
    noDelay,
  );
}

function post(path: string, body: unknown) {
  return handleMockRequest(
    new Request(`https://mock.test${path}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    noDelay,
  );
}

async function json<T = Record<string, unknown>>(response: Response) {
  return (await response.json()) as T;
}

describe("mock GitHub reads", () => {
  it("returns repo metadata", async () => {
    const response = await get("/repos/demo/api");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await json(response)).toMatchObject({
      name: "api",
      full_name: "demo/api",
      default_branch: "main",
    });
  });

  it("matches owner and repo case-insensitively", async () => {
    expect((await get("/repos/Demo/WEB")).status).toBe(200);
  });

  it("returns files as base64 and directories as lists", async () => {
    const file = await json(await get("/repos/demo/api/contents/README.md"));
    expect(file).toMatchObject({ type: "file", path: "README.md" });
    expect(atob(String(file.content))).toContain("# api");

    const root = await json<{ name: string; type: string }[]>(
      await get("/repos/demo/api/contents"),
    );
    expect(root).toContainEqual(
      expect.objectContaining({ name: "src", type: "dir" }),
    );

    const src = await json<{ path: string }[]>(
      await get("/repos/demo/api/contents/src?ref=main"),
    );
    expect(src.map((entry) => entry.path)).toEqual([
      "src/index.ts",
      "src/routes",
    ]);
  });

  it("filters pulls and issues by state", async () => {
    const open = await json<{ state: string }[]>(
      await get("/repos/demo/api/pulls"),
    );
    const all = await json<unknown[]>(
      await get("/repos/demo/api/pulls?state=all"),
    );
    expect(open.every((pull) => pull.state === "open")).toBe(true);
    expect(all.length).toBeGreaterThan(open.length);

    const closed = await json<{ state: string }[]>(
      await get("/repos/demo/api/issues?state=closed"),
    );
    expect(closed.length).toBeGreaterThan(0);
    expect(closed.every((issue) => issue.state === "closed")).toBe(true);
  });

  it("paginates lists", async () => {
    const first = await json<{ number: number }[]>(
      await get("/repos/demo/api/issues?state=all&per_page=2"),
    );
    const second = await json<{ number: number }[]>(
      await get("/repos/demo/api/issues?state=all&per_page=2&page=2"),
    );
    expect(first.map((issue) => issue.number)).toEqual([1, 2]);
    expect(second.map((issue) => issue.number)).toEqual([3, 4]);
  });

  it("returns a single pull and 404 for unknown numbers", async () => {
    const pulls = await json<{ number: number }[]>(
      await get("/repos/demo/api/pulls?state=all"),
    );
    const number = pulls[0]?.number;
    expect(
      await json(await get(`/repos/demo/api/pulls/${number}`)),
    ).toMatchObject({
      number,
    });
    expect((await get("/repos/demo/api/pulls/999")).status).toBe(404);
  });

  it("lists commits newest first and returns their status", async () => {
    const commits = await json<{ sha: string; commit: { message: string } }[]>(
      await get("/repos/demo/api/commits"),
    );
    expect(commits[0]?.commit.message).toBe("Release 1.4.0");
    const sha = commits[0]?.sha ?? "";
    expect(sha).toMatch(/^[0-9a-f]{40}$/);

    const status = await json(
      await get(`/repos/demo/api/commits/${sha}/status`),
    );
    expect(status).toMatchObject({ sha, total_count: 1 });
    expect(
      (await get(`/repos/demo/api/commits/${"0".repeat(40)}/status`)).status,
    ).toBe(404);
  });

  it("is deterministic across calls", async () => {
    const a = await get("/repos/demo/infra/commits");
    const b = await get("/repos/demo/infra/commits");
    expect(a.headers.get("etag")).toBe(b.headers.get("etag"));
    expect(await a.text()).toBe(await b.text());
  });
});

describe("mock GitHub ETags", () => {
  it("sends a strong ETag and honours If-None-Match", async () => {
    const first = await get("/repos/demo/api");
    const etag = first.headers.get("etag") ?? "";
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);

    const cached = await get("/repos/demo/api", { "If-None-Match": etag });
    expect(cached.status).toBe(304);
    expect(cached.headers.get("etag")).toBe(etag);
    expect(await cached.text()).toBe("");
  });

  it("matches weak and listed tags and ignores stale ones", async () => {
    const etag = (await get("/repos/demo/web")).headers.get("etag") ?? "";
    const listed = await get("/repos/demo/web", {
      "If-None-Match": `"stale", W/${etag}`,
    });
    expect(listed.status).toBe(304);
    const stale = await get("/repos/demo/web", { "If-None-Match": '"stale"' });
    expect(stale.status).toBe(200);
  });

  it("uses different ETags for different content", async () => {
    const api = (await get("/repos/demo/api")).headers.get("etag");
    const web = (await get("/repos/demo/web")).headers.get("etag");
    expect(api).not.toBe(web);
  });
});

describe("mock GitHub writes", () => {
  it("creates issues", async () => {
    const response = await post("/repos/demo/api/issues", {
      title: "From an agent",
      labels: ["bug"],
    });
    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({
      title: "From an agent",
      state: "open",
      labels: [expect.objectContaining({ name: "bug" })],
    });
  });

  it("creates comments", async () => {
    const response = await post("/repos/demo/api/issues/1/comments", {
      body: "hi",
    });
    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({ body: "hi", issue_number: 1 });
  });

  it("adds labels from an array or an object", async () => {
    const fromArray = await json<{ name: string }[]>(
      await post("/repos/demo/api/issues/1/labels", ["ci"]),
    );
    expect(fromArray.map((label) => label.name)).toEqual(["bug", "ci"]);
    const fromObject = await post("/repos/demo/api/issues/1/labels", {
      labels: ["docs"],
    });
    expect(fromObject.status).toBe(200);
  });

  it("creates commit statuses", async () => {
    const sha = "a".repeat(40);
    const response = await post(`/repos/demo/api/statuses/${sha}`, {
      state: "success",
      context: "ci/test",
    });
    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({
      state: "success",
      context: "ci/test",
    });
    expect(
      (await post("/repos/demo/api/statuses/nope", { state: "success" }))
        .status,
    ).toBe(422);
  });

  it("rejects bad JSON and invalid input", async () => {
    expect((await post("/repos/demo/api/issues", "{")).status).toBe(400);
    expect(
      (await post("/repos/demo/api/issues", { body: "no title" })).status,
    ).toBe(422);
    expect(
      (
        await post("/repos/demo/api/statuses/" + "a".repeat(40), {
          state: "odd",
        })
      ).status,
    ).toBe(422);
  });
});

describe("mock GitHub errors", () => {
  it("returns 404 for unknown repos, owners and endpoints", async () => {
    for (const path of [
      "/repos/demo/nope",
      "/repos/other/api",
      "/repos/demo/api/branches",
      "/user",
    ]) {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(await json(response)).toMatchObject({ message: "Not Found" });
    }
  });

  it("returns 404 for unsupported methods", async () => {
    const response = await handleMockRequest(
      new Request("https://mock.test/repos/demo/api", { method: "DELETE" }),
      noDelay,
    );
    expect(response.status).toBe(404);
  });

  it("waits for the simulated latency", async () => {
    const start = Date.now();
    await handleMockRequest(new Request("https://mock.test/repos/demo/api"), {
      latencyMs: () => 50,
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});
