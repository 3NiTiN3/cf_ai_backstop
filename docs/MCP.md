# Using Backstop from Claude Code

Backstop serves an MCP endpoint at `/mcp` (streamable HTTP). A coding agent can call GitHub through Backstop as MCP tools, without changing its HTTP client.

Deployed endpoint: `https://cf-ai-backstop.gambier-toad-0c.workers.dev/mcp`
Local endpoint: `http://localhost:5173/mcp` (while `npm run dev` is running)

## Tools

| Tool              | What it does                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github_read`     | GET a GitHub REST API path through Backstop. Returns the status, the cache status (`HIT`, `MISS`, `REVALIDATED`, `STALE`), the gateway mode and the body. Bodies over 20,000 characters are cut, with a note.                                                          |
| `github_write`    | Send a write (`POST`, `PATCH`, `PUT`, `DELETE`). Safe writes such as comments are queued when GitHub is down and replayed in order later. The result says whether the write was sent, queued (with its id) or not sent. Pass the same `idempotencyKey` when you retry. |
| `backstop_status` | Breaker state, queue depth, cache totals and recent incidents for a namespace, or for one repo.                                                                                                                                                                        |

Every tool takes a `namespace`: `demo` (the built-in mock GitHub, the default) or `live` (real GitHub).

## Add it to Claude Code

```bash
claude mcp add --transport http backstop https://cf-ai-backstop.gambier-toad-0c.workers.dev/mcp
```

For the live namespace, pass a GitHub token in the `X-GitHub-Token` header. Backstop forwards it to GitHub and never returns it. Live writes are refused without it.

```bash
claude mcp add --transport http backstop https://cf-ai-backstop.gambier-toad-0c.workers.dev/mcp \
  --header "X-GitHub-Token: $GITHUB_TOKEN"
```

To share the setup with a project without committing the token, use `.mcp.json`, which expands environment variables:

```json
{
  "mcpServers": {
    "backstop": {
      "type": "http",
      "url": "https://cf-ai-backstop.gambier-toad-0c.workers.dev/mcp",
      "headers": { "X-GitHub-Token": "${GITHUB_TOKEN}" }
    }
  }
}
```

## Check that it works

```bash
claude mcp list
```

Inside Claude Code, `/mcp` shows the server and its three tools. Then ask, for example:

> Read the repo demo/api through Backstop and tell me its open pull requests.

Claude Code calls `github_read` with `path: /repos/demo/api/pulls?state=open`. Ask again and the cache status changes from `MISS` to `HIT`, or to `REVALIDATED` once the 15 second cache time for lists has passed (GitHub answered 304, so no data was sent again).

## Try an outage

Open the dashboard, press "Play the outage story", and during the outage ask Claude Code to comment on `demo/web` issue 1. `github_write` reports that the write was queued. After recovery, `backstop_status` for `demo/web` shows it replayed.
