import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

async function rpc(body: object): Promise<unknown> {
  const response = await exports.default.fetch("http://backstop.test/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-github-token": "ghp_never_echoed",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  });
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain("ghp_never_echoed");
  const data = text.includes("data:")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5))
        .join("")
    : text;
  return JSON.parse(data);
}

it("lists the three tools and runs github_read over MCP", async () => {
  const init = await rpc({
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    },
  });
  expect(init).toMatchObject({ result: { serverInfo: { name: "backstop" } } });

  const listed = (await rpc({ method: "tools/list", params: {} })) as {
    result: { tools: { name: string }[] };
  };
  expect(listed.result.tools.map((tool) => tool.name).sort()).toEqual([
    "backstop_status",
    "github_read",
    "github_write",
  ]);

  const called = (await rpc({
    method: "tools/call",
    params: {
      name: "github_read",
      arguments: { path: "/repos/demo/api/pulls?state=open" },
    },
  })) as { result: { content: { text: string }[]; isError: boolean } };
  expect(called.result.isError).toBe(false);
  expect(JSON.parse(called.result.content[0]?.text ?? "{}")).toMatchObject({
    status: 200,
  });
});

it("rejects paths that are not GitHub API paths", async () => {
  const called = (await rpc({
    method: "tools/call",
    params: { name: "github_read", arguments: { path: "https://evil.test/" } },
  })) as { result?: { isError: boolean }; error?: unknown };
  expect(called.result?.isError ?? called.error !== undefined).toBe(true);
});
