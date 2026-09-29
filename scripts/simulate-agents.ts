import { parseArgs } from "node:util";
import { z } from "zod";
import { formatSummary, summarize, type Sample } from "./simulate/summary.ts";

const DEMO_REPOS = ["demo/api", "demo/web", "demo/infra"];
const DEMO_READS = [
  "",
  "/contents",
  "/issues?state=open",
  "/pulls?state=open",
  "/commits",
  "/issues?state=all&page=2",
];
const LIVE_READS = [
  "",
  "/issues?state=open&per_page=10",
  "/pulls?state=open&per_page=10",
  "/commits?per_page=10",
];
const DEMO_PAUSE_MS = 500;
const LIVE_PAUSE_MS = 2000;
const DEMO_WRITE_SHARE = 0.1;

const Options = z.object({
  url: z.url(),
  agents: z.coerce.number().int().min(1).max(50),
  seconds: z.coerce.number().int().min(5).max(600),
  namespace: z.enum(["demo", "live"]),
  repos: z.string().optional(),
});

type Options = z.infer<typeof Options>;

const { values } = parseArgs({
  options: {
    url: {
      type: "string",
      default: process.env.BACKSTOP_URL ?? "http://localhost:5173",
    },
    agents: { type: "string", default: "5" },
    seconds: { type: "string", default: "30" },
    namespace: { type: "string", default: "demo" },
    repos: { type: "string" },
  },
});

const options = Options.parse(values);
const token = process.env.GITHUB_TOKEN;
const repos =
  options.repos?.split(",").map((repo) => repo.trim()) ??
  (options.namespace === "demo"
    ? DEMO_REPOS
    : ["cloudflare/workers-sdk", "cloudflare/agents"]);

if (options.namespace === "live" && !token) {
  console.warn(
    "GITHUB_TOKEN is not set, so live reads share GitHub's anonymous limit of 60 an hour.",
  );
}

console.log(
  `Running ${options.agents} agents for ${options.seconds}s against ${options.url} (${options.namespace}: ${repos.join(", ")})`,
);

const deadline = Date.now() + options.seconds * 1000;
const samples = (
  await Promise.all(
    Array.from({ length: options.agents }, (_, agent) =>
      runAgent(agent, options),
    ),
  )
).flat();

console.log(`\n${formatSummary(summarize(samples))}`);

async function runAgent(agent: number, opts: Options): Promise<Sample[]> {
  const collected: Sample[] = [];
  let sequence = 0;
  while (Date.now() < deadline) {
    const sample = await send(requestFor(agent, sequence++, opts));
    if (sample) collected.push(sample);
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        opts.namespace === "demo" ? DEMO_PAUSE_MS : LIVE_PAUSE_MS,
      ),
    );
  }
  return collected;
}

function requestFor(agent: number, sequence: number, opts: Options): Request {
  const repo = pick(repos);
  const prefix = opts.namespace === "demo" ? "/demo/gh" : "/gh";
  const base = `${opts.url}${prefix}/repos/${repo}`;
  const headers: Record<string, string> = {
    "user-agent": "backstop-simulator",
  };
  if (opts.namespace === "live" && token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (opts.namespace === "demo" && Math.random() < DEMO_WRITE_SHARE) {
    return new Request(`${base}/issues/1/comments`, {
      method: "POST",
      headers: {
        ...headers,
        authorization: `token cli-agent-${agent + 1}`,
        "content-type": "application/json",
        "idempotency-key": `cli-${Date.now()}-${agent}-${sequence}`,
      },
      body: JSON.stringify({
        body: `Simulated update from agent ${agent + 1}`,
      }),
    });
  }
  const reads = opts.namespace === "demo" ? DEMO_READS : LIVE_READS;
  return new Request(`${base}${pick(reads)}`, { headers });
}

async function send(request: Request): Promise<Sample | null> {
  const started = performance.now();
  try {
    const response = await fetch(request);
    await response.body?.cancel();
    return {
      status: response.status,
      cache: response.headers.get("x-backstop-cache"),
      coalesced: response.headers.get("x-backstop-coalesced") === "1",
      latencyMs: performance.now() - started,
    };
  } catch {
    return null;
  }
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)] ?? items[0];
  if (item === undefined) throw new Error("pick needs at least one item");
  return item;
}
