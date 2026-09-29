export const DEMO_REPOS = ["demo/api", "demo/web", "demo/infra"] as const;

const REQUESTS_PER_AGENT = 2;
const READ_SHARE = 0.7;
const LIST_SHARE = 0.2;

const HOT_READS = ["", "/contents", "/issues?state=open", "/pulls?state=open"];
const LIST_READS = [
  "/commits",
  "/issues?state=all&page=1",
  "/issues?state=all&page=2",
  "/pulls?state=all",
];
const COMMENTED_ISSUES = [1, 2];

export interface PlannedRequest {
  method: "GET" | "POST";
  path: string;
  headers: Record<string, string>;
  body?: string;
}

export function planTick(
  agents: number,
  tick: number,
  random: () => number,
): PlannedRequest[] {
  return Array.from({ length: agents }, (_, agent) =>
    Array.from({ length: REQUESTS_PER_AGENT }, (_, slot) =>
      planRequest(agent, `${tick}-${agent}-${slot}`, random),
    ),
  ).flat();
}

function planRequest(
  agent: number,
  id: string,
  random: () => number,
): PlannedRequest {
  const repo = `/repos/${pick(DEMO_REPOS, random)}`;
  const roll = random();
  if (roll < READ_SHARE) {
    return read(`${repo}${pick(HOT_READS, random)}`);
  }
  if (roll < READ_SHARE + LIST_SHARE) {
    return read(`${repo}${pick(LIST_READS, random)}`);
  }
  return {
    method: "POST",
    path: `${repo}/issues/${pick(COMMENTED_ISSUES, random)}/comments`,
    headers: {
      authorization: `token demo-agent-${agent + 1}`,
      "content-type": "application/json",
      "idempotency-key": `demo-${id}`,
    },
    body: JSON.stringify({ body: `Progress update from agent ${agent + 1}` }),
  };
}

function read(path: string): PlannedRequest {
  return { method: "GET", path, headers: {} };
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)] ?? items[0];
  if (item === undefined) throw new Error("pick needs at least one item");
  return item;
}
