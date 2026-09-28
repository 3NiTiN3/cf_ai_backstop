# Phase 1: Read path

## Objective
Agents can point their GitHub base URL at Backstop and get correct responses. Repeated reads are cached per repo, revalidated with ETags, and identical concurrent requests share one upstream call. A built-in mock GitHub makes everything testable and demoable without a token.

## Read first
- `build/GOAL.md` (architecture)
- Cloudflare docs: Durable Objects SQLite storage API, Durable Object RPC
- GitHub docs: conditional requests (ETag, If-None-Match, 304 and rate limits)

## Design notes
- Two namespaces share all logic and differ only in upstream:
  - `live`: `/gh/*` goes to `https://api.github.com`
  - `demo`: `/demo/gh/*` goes to the in-process mock
- One `RepoGateway` Durable Object per `namespace:owner/repo`. Paths that are not under `/repos/{owner}/{repo}` go to `namespace:_global`.
- One `Registry` Durable Object (`idFromName("global")`) tracks active repos and aggregates stats for the dashboard.
- Keep modules small: `src/gateway/routes.ts`, `upstream.ts`, `cache.ts`, `cache-policy.ts`, `coalesce.ts`, `repo-gateway.ts`, `registry.ts`, `src/mock/github.ts`.

## Tasks

### 1.1 Routing and repo keys
- Parse `/gh/*` and `/demo/gh/*` into `{ namespace, upstreamPath, repoKey }`.
- `repoKey` is `owner/repo` lowercased for `/repos/{owner}/{repo}/...`, else `_global`.
- Worker entry forwards gateway requests to the right `RepoGateway` stub. Unknown paths return 404 JSON.
- Keep the existing agent routes and static assets working.
- **Done when:** unit tests cover path parsing edge cases (trailing slash, query strings, encoded characters, missing repo). A request to `/demo/gh/repos/demo/api` reaches the right DO (verified with a test).
- **Commit:** `feat(gateway): route GitHub API paths to per-repo durable objects`

### 1.2 Mock GitHub
- `src/mock/github.ts`: a pure `handleMockRequest(request): Promise<Response>`.
- Repos: `demo/api`, `demo/web`, `demo/infra`. Endpoints: `GET /repos/{o}/{r}`, `/contents/{path}`, `/pulls`, `/pulls/{n}`, `/issues`, `/commits`, `/commits/{sha}/status`; `POST /repos/{o}/{r}/issues`, `/issues/{n}/comments`, `/issues/{n}/labels`, `/statuses/{sha}`.
- Deterministic data, realistic shapes (subset of real GitHub fields). Strong ETags derived from content. Honors `If-None-Match` with 304.
- Simulated latency of 40 to 150 ms.
- The mock holds no global mutable state that leaks between tests; POSTs return created objects but storage can be in-memory per isolate.
- **Done when:** tests cover each endpoint, ETag and 304 behaviour, 404 for unknown repos.
- **Commit:** `feat(demo): add deterministic mock GitHub upstream`

### 1.3 Upstream client
- `src/gateway/upstream.ts`: `fetchUpstream(namespace, request)` returns `{ status, headers, body, etag, lastModified, latencyMs, outcome }` where outcome is `ok | client_error | server_error | rate_limited | timeout | network_error`.
- Live: `https://api.github.com`, 10 second timeout via `AbortSignal.timeout`, `User-Agent: cf-ai-backstop`, passes through `Authorization`, `Accept`, `X-GitHub-Api-Version`. Demo: calls the mock directly.
- Only a safe subset of response headers is kept (content-type, etag, last-modified, link, x-ratelimit-*, retry-after).
- Never log the Authorization header.
- **Done when:** tests with the mock and a stubbed fetch cover each outcome classification.
- **Commit:** `feat(gateway): add upstream client with outcome classification`

### 1.4 Cache in RepoGateway
- `RepoGateway` Durable Object with SQLite table `cache_entries (key TEXT PRIMARY KEY, status INT, headers TEXT, body TEXT, etag TEXT, last_modified TEXT, fetched_at INT, expires_at INT, hits INT)`.
- Cache key: method, path, sorted query, Accept header, and scope. Scope is `public` without Authorization, otherwise the first 16 hex chars of SHA-256 of the token. Private data never crosses scopes.
- `cache-policy.ts`: TTL by path pattern. Examples: contents requested by commit sha 24h, repo metadata 60s, lists 15s, default 30s. Keep it a simple ordered table.
- Only cache GET 200 responses under 1 MB.
- Response header `x-backstop-cache: HIT | MISS`.
- **Done when:** tests prove miss then hit, TTL expiry, different tokens get different entries, anonymous never sees authenticated entries, non-200 and non-GET never cached.
- **Commit:** `feat(cache): cache GitHub reads per repo and auth scope`

### 1.5 Conditional revalidation
- On an expired entry with an ETag or Last-Modified, send `If-None-Match` / `If-Modified-Since`.
- A 304 refreshes `expires_at` and returns the cached body with `x-backstop-cache: REVALIDATED`.
- Track counters: `upstream_calls`, `upstream_avoided` (hits and coalesced), `revalidated`.
- **Done when:** tests cover 304 refresh, 200 replacement on change, counters.
- **Commit:** `feat(cache): revalidate expired entries with conditional requests`

### 1.6 Request coalescing
- In-memory `Map<cacheKey, Promise<Result>>` inside the DO. Concurrent identical GETs await the same upstream fetch. Clear the entry when it settles, including on failure.
- Coalesced responses carry `x-backstop-coalesced: 1` and count as avoided calls.
- **Done when:** a test fires 10 identical requests concurrently and the upstream stub is called once.
- **Commit:** `feat(gateway): coalesce identical concurrent reads`

### 1.7 Events, stats and Registry
- `events` table in RepoGateway: `ts, kind, method, path, status, cache, latency_ms`. Keep the most recent 2000 rows.
- RPC methods on RepoGateway: `getStats()`, `getRecentEvents(limit)`.
- `Registry` DO: records active repos per namespace. RepoGateway reports a small stats snapshot at most once every 2 seconds per repo (throttled, fire and forget).
- `GET /api/overview?namespace=demo` returns totals and per-repo summaries from Registry.
- **Done when:** tests cover event retention and the overview shape. After a few demo requests `/api/overview` shows them.
- **Commit:** `feat(api): add per-repo events and registry overview`

## Phase exit gate
- `curl` a demo repo twice: first `MISS`, then `HIT`. After TTL: `REVALIDATED`.
- `curl` a real public repo through `/gh/repos/cloudflare/workers-sdk`: correct JSON, cache headers present.
- `/api/overview` shows both requests.
- Deploy (ask first) and repeat the demo curl against the deployed URL.
