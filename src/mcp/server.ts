import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NamespaceSchema } from "../api/namespace";
import { GitHubPath } from "./gateway-call";
import {
  backstopStatus,
  githubRead,
  githubWrite,
  type McpToolContext,
} from "./tools";

const NamespaceInput = NamespaceSchema.default("demo").describe(
  "demo (built-in mock GitHub) or live (real GitHub). Defaults to demo.",
);

export function createBackstopServer(context: McpToolContext): McpServer {
  const server = new McpServer({ name: "backstop", version: "1.0.0" });

  server.registerTool(
    "github_read",
    {
      description:
        "GET a GitHub REST API path through Backstop. Reads are cached, deduplicated and served stale when GitHub is down. Returns status, cache status, gateway mode and the body.",
      inputSchema: { namespace: NamespaceInput, path: GitHubPath },
      annotations: { readOnlyHint: true },
    },
    async (input) => toResult(await githubRead(context, input)),
  );

  server.registerTool(
    "github_write",
    {
      description:
        "Send a GitHub REST API write through Backstop. Safe writes such as comments are queued when GitHub is down and replayed in order later; the result says whether it was sent or queued.",
      inputSchema: {
        namespace: NamespaceInput,
        method: z.enum(["POST", "PATCH", "PUT", "DELETE"]),
        path: GitHubPath,
        body: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("JSON body for the GitHub API call."),
        idempotencyKey: z
          .string()
          .max(200)
          .optional()
          .describe(
            "Reuse the same key when retrying so the write happens once.",
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async (input) => toResult(await githubWrite(context, input)),
  );

  server.registerTool(
    "backstop_status",
    {
      description:
        "Backstop health for a namespace, or for one repo when given: breaker state, queue depth, cache totals and recent incidents.",
      inputSchema: {
        namespace: NamespaceInput,
        repo: z
          .string()
          .max(200)
          .optional()
          .describe("Repository as owner/name, for example demo/api."),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => toResult(await backstopStatus(context, input)),
  );

  return server;
}

function toResult(result: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    isError: "error" in result,
  };
}
