# Benchmarks

How much GitHub traffic Backstop saves when many agents read the same repos, and what a cache hit costs.

## Setup

- Deployed Worker: `https://cf-ai-backstop.gambier-toad-0c.workers.dev` (version 37fee219), measured on 2026-09-29 between 02:55 and 03:01 UTC.
- Client: `npm run simulate` (`scripts/simulate-agents.ts`) on one laptop in India. Cloudflare served it from Singapore (`cf-ray` ending in `SIN`).
- Demo runs: 20 agents for 60 seconds against the demo namespace (the built-in mock GitHub), three times. Each agent sends a request, waits 500 ms after the answer, and repeats (a little over one request a second): reads of the repo, contents, open issues, open pulls, commits and a second page of issues across `demo/api`, `demo/web` and `demo/infra`, plus about 10% comment writes.
- Live run: 5 agents for 60 seconds against real GitHub (`cloudflare/workers-sdk` and `cloudflare/agents`), reads only, with a 2 second wait after each answer, and a GitHub token.
- Cache times: repo metadata 60 s, lists 15 s, anything else 30 s.

"Upstream calls avoided" counts cache hits, coalesced requests and stale reads, over those plus the requests that reached GitHub (misses, revalidations and writes sent straight through). A revalidation counts as an upstream call even though GitHub answers 304 without a body.

## Results

### Demo namespace, 20 agents, 60 seconds

| Run    | Requests | Cache hits | Revalidated | Coalesced | Upstream calls | Avoided | p50    | p95    | Hit p50 | Hit p95 |
| ------ | -------- | ---------- | ----------- | --------- | -------------- | ------- | ------ | ------ | ------- | ------- |
| 1      | 1,376    | 1,169      | 57          | 14        | 193            | 86.0%   | 343 ms | 736 ms | 334 ms  | 671 ms  |
| 2      | 1,372    | 1,157      | 57          | 8         | 207            | 84.9%   | 345 ms | 683 ms | 337 ms  | 623 ms  |
| 3      | 1,319    | 1,119      | 56          | 8         | 192            | 85.4%   | 354 ms | 843 ms | 338 ms  | 796 ms  |
| Median | 1,372    | 1,157      | 57          | 8         | 193            | 85.4%   | 345 ms | 736 ms | 337 ms  | 671 ms  |

No request was rate limited and none failed. An earlier set of three runs with the same settings, a few minutes before, avoided 86.8%, 86.5% and 85.1%.

### Live namespace, 5 agents, 60 seconds

| Requests | Cache hits | Revalidated | Coalesced | Upstream calls | Avoided | p50    | p95      | Hit p50 | Hit p95  |
| -------- | ---------- | ----------- | --------- | -------------- | ------- | ------ | -------- | ------- | -------- |
| 109      | 86         | 14          | 1         | 22             | 79.8%   | 660 ms | 1,843 ms | 495 ms  | 1,564 ms |

With 20 agents on the demo namespace, Backstop kept about 85% of calls away from GitHub, well above the 60% goal. The live run is smaller and still kept about 80% away.

## Where the time goes

Times above are measured by the client, so they include the network. Over one reused connection from the same laptop:

| Request                                          | Median |
| ------------------------------------------------ | ------ |
| Static file from the Cloudflare edge (no Worker) | 175 ms |
| Demo read that is a cache hit                    | 370 ms |
| API call answered by the Registry object         | 360 ms |

The network to Cloudflare costs about 175 ms. A cache hit adds about 200 ms on top: the Worker passes the request to the repo's Durable Object, which runs in a single location, and from Singapore that location is some distance away. An agent close to the object's region would see most of that 200 ms disappear.

## Caveats

- Small sample: three one-minute demo runs and one live run, from one client.
- The mock answers instantly, so demo runs understate the time a miss costs against real GitHub. They also make every agent read the same three repos, which suits caching.
- Latency depends on where the client is and where each Durable Object was created. These numbers are from India through Singapore.
- Rate limits were on (600 demo requests per 10 seconds per address); 20 agents stayed well below them.
- The live run used one token for all agents, so they shared one private cache scope. Agents with different tokens do not share cached private data, so they would see fewer hits.
