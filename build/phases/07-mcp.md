# Phase 7: MCP server

## Objective
Coding agents can use Backstop directly as MCP tools, so adopting it does not require changing an agent's HTTP client.

## Read first
- Cloudflare docs: `McpAgent` in the Agents SDK, remote MCP servers, streamable HTTP transport, how to mount the server on a path
- MCP TypeScript SDK docs for `McpServer.tool` / `registerTool`

## Tasks

### 7.1 BackstopMcp
- `src/mcp/server.ts`: `BackstopMcp extends McpAgent`, mounted at `/mcp`. Add the Durable Object binding and migration.
- Tools:
  - `github_read({ namespace, path })` GET through the gateway, returns status, cache status, mode and body (truncated to a sensible size with a note when truncated).
  - `github_write({ namespace, method, path, body, idempotencyKey? })` goes through the gateway, so it queues during outages and reports that clearly.
  - `backstop_status({ namespace, repo? })` returns breaker state, queue depth and recent incidents.
- Live namespace calls need a GitHub token supplied by the MCP client as a header; document which header. Never echo it back.
- **Done when:** tests call each tool handler. `npx @modelcontextprotocol/inspector` lists and runs all three tools against local dev.
- **Commit:** `feat(mcp): expose gateway as MCP tools`

### 7.2 Connect from Claude Code
- Document the exact command, for example `claude mcp add --transport http backstop <url>/mcp`, and verify the current syntax in Claude Code docs.
- Ask the user to run it against the deployed URL, then ask Claude Code to read `demo/api` through Backstop, and to take a screenshot for the README (save as `docs/images/mcp-claude-code.png`).
- **Done when:** the user confirms it works. Screenshot committed if provided.
- **Commit:** `docs(mcp): add Claude Code connection guide`

### 7.3 Adoption guide
- `docs/USING_WITH_AGENTS.md`: three short sections.
  - Octokit or any REST client: set the base URL to `<url>/gh`.
  - curl examples for read, write with `Idempotency-Key`, and reading `x-backstop-*` headers.
  - MCP clients.
- State limits plainly: REST only, no git protocol, `gh` CLI cannot redirect github.com API calls.
- **Done when:** every example in the guide was run once and works.
- **Commit:** `docs: add guide for pointing agents at Backstop`

## Phase exit gate
- MCP inspector runs all tools against the deployed URL.
- Claude Code reads through Backstop (confirmed by the user).
- Deploy (ask first).
