# Pointing agents at Backstop

Backstop speaks the GitHub REST API. Point a client at Backstop instead of `https://api.github.com` and it gets caching, stale reads during outages and queued writes, with no other code changes.

| Namespace | Base URL                                                     | Upstream                                                          |
| --------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Live      | `https://cf-ai-backstop.gambier-toad-0c.workers.dev/gh`      | Real GitHub                                                       |
| Demo      | `https://cf-ai-backstop.gambier-toad-0c.workers.dev/demo/gh` | Built-in mock GitHub (repos `demo/api`, `demo/web`, `demo/infra`) |

The examples below use `BACKSTOP=https://cf-ai-backstop.gambier-toad-0c.workers.dev`. For local development, use `BACKSTOP=http://localhost:5173`.

## Octokit or any REST client

Set the base URL. Everything else stays the same.

```js
import { Octokit } from "@octokit/rest";

const github = new Octokit({
  baseUrl: `${process.env.BACKSTOP}/gh`,
  auth: process.env.GITHUB_TOKEN,
});

const { data } = await github.rest.repos.get({
  owner: "cloudflare",
  repo: "agents",
});
console.log(data.full_name);
```

Use `/demo/gh` as the base URL to try it without a token, for example with `owner: "demo", repo: "api"`.

Cached responses are kept per token, so one caller never sees another caller's private data.

## curl

Read, and look at the Backstop headers:

```bash
curl -si "$BACKSTOP/demo/gh/repos/demo/api/issues?state=open" | grep -i '^x-backstop'
```

```
x-backstop-cache: MISS
x-backstop-mode: normal
```

Run it again and `x-backstop-cache` becomes `HIT`. (If the path was cached earlier, the first call may show `REVALIDATED`.)

| Header                 | Values                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x-backstop-cache`     | `HIT` (from cache), `MISS` (fetched), `REVALIDATED` (GitHub said 304), `STALE` (GitHub unavailable, cached copy served), `BYPASS` (not cacheable), `QUEUED` (write queued) |
| `x-backstop-mode`      | `normal`, or `degraded` while the circuit breaker for that repo is open or half-open                                                                                       |
| `x-backstop-coalesced` | `1` when the response was shared with an identical request already in flight                                                                                               |
| `x-backstop-queued`    | The queue id of a queued write                                                                                                                                             |

Write with an idempotency key, so a retry cannot post twice:

```bash
curl -s -X POST "$BACKSTOP/demo/gh/repos/demo/web/issues/1/comments" \
  -H "Idempotency-Key: build-42-comment" \
  -H "Content-Type: application/json" \
  -d '{"body":"Build 42 passed"}'
```

When GitHub is down, a safe write such as a comment returns `202` instead of failing, and Backstop replays it in order once GitHub recovers. To see this on the demo namespace, start a blackout first:

```bash
curl -s -X POST "$BACKSTOP/api/chaos" -H "Content-Type: application/json" \
  -d '{"namespace":"demo","mode":"blackout"}'

curl -s -X POST "$BACKSTOP/demo/gh/repos/demo/web/issues/1/comments" \
  -H "Idempotency-Key: build-43-comment" \
  -H "Content-Type: application/json" \
  -d '{"body":"Build 43 passed"}'
```

```json
{ "queued": true, "id": "3c1f...", "position": 1, "status": "pending" }
```

Sending the same `Idempotency-Key` again returns the same queued write. Turn chaos off with `{"namespace":"demo","mode":"off"}`; after the breaker's cooldown the next request closes it and the write is replayed.

Writes that are not safe to replay later, such as merging a pull request, are never queued. While the breaker is open they return `503` with `write_not_queueable`; before it opens they fail with the upstream error.

## MCP clients

Backstop also serves MCP tools at `$BACKSTOP/mcp`: `github_read`, `github_write` and `backstop_status`. See [MCP.md](MCP.md) for Claude Code.

## Limits

- REST only. The GraphQL API is not proxied.
- No git protocol. `git clone`, `fetch` and `push` still go to github.com.
- The `gh` CLI cannot be pointed at Backstop for github.com; it only takes other hosts for GitHub Enterprise, with a different URL layout.
- Only reads are cached and only safe writes are queued. Anything else passes through, or fails fast during an outage.
