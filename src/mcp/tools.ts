import { healthView, incidentView, overviewView } from "../agent/views";
import { listIncidents } from "../gateway/incident-query";
import { findRepoGateway } from "../gateway/lookup";
import { REGISTRY_NAME } from "../gateway/registry";
import { repoKeyFromName, type Namespace } from "../gateway/routes";
import {
  callGateway,
  type GatewayCall,
  type GatewayReply,
} from "./gateway-call";

export const TOKEN_HEADER = "x-github-token";

const RECENT_INCIDENTS = 3;

export interface McpToolContext {
  env: Env;
  token: string | null;
}

export type WriteMethod = Exclude<GatewayCall["method"], "GET">;

export async function githubRead(
  context: McpToolContext,
  input: { namespace: Namespace; path: string },
) {
  const reply = await callGateway(context.env, {
    ...input,
    method: "GET",
    token: context.token,
  });
  return describeReply(reply);
}

export async function githubWrite(
  context: McpToolContext,
  input: {
    namespace: Namespace;
    method: WriteMethod;
    path: string;
    body?: unknown;
    idempotencyKey?: string;
  },
) {
  if (input.namespace === "live" && !context.token) {
    return {
      outcome: "refused",
      message: `Live writes need a GitHub token in the ${TOKEN_HEADER} header.`,
    };
  }
  const reply = await callGateway(context.env, {
    ...input,
    token: context.token,
  });
  return { outcome: writeOutcome(reply), ...describeReply(reply) };
}

export async function backstopStatus(
  context: McpToolContext,
  input: { namespace: Namespace; repo?: string },
) {
  const { env } = context;
  const { namespace } = input;
  if (input.repo === undefined) {
    const registry = env.Registry.getByName(REGISTRY_NAME);
    const [overview, chaos, incidents] = await Promise.all([
      registry.overview(namespace),
      registry.getChaos(namespace),
      listIncidents(env, namespace, null, RECENT_INCIDENTS),
    ]);
    return {
      ...overviewView(overview, chaos),
      recentIncidents: (incidents ?? []).map((incident) =>
        incidentView(incident, null),
      ),
    };
  }
  const repoKey = repoKeyFromName(input.repo);
  if (repoKey === null) return { error: `${input.repo} is not owner/name` };
  const gateway = await findRepoGateway(env, { namespace, repoKey });
  if (!gateway)
    return { error: `No traffic seen for ${namespace}/${repoKey} yet` };
  const [health, queue, incidents] = await Promise.all([
    gateway.getHealth(),
    gateway.listQueue(),
    listIncidents(env, namespace, repoKey, RECENT_INCIDENTS),
  ]);
  return {
    namespace,
    repo: repoKey,
    ...healthView(health),
    queue: queue.counts,
    recentIncidents: (incidents ?? []).map((incident) =>
      incidentView(incident, null),
    ),
  };
}

function writeOutcome(reply: GatewayReply): string {
  if (reply.status === 202 && reply.cache === "QUEUED") {
    return `queued: GitHub is unavailable, so Backstop queued this write as ${reply.queuedId ?? "unknown"} and will replay it in order when GitHub recovers`;
  }
  if (reply.status >= 200 && reply.status < 300) return "sent";
  if (reply.status === 503)
    return "not sent: GitHub is unavailable and this write cannot be queued";
  return `failed with status ${reply.status}`;
}

function describeReply(reply: GatewayReply) {
  return {
    status: reply.status,
    cache: reply.cache,
    mode: reply.mode,
    coalesced: reply.coalesced,
    body: reply.body,
    ...(reply.truncated
      ? { note: "The body was truncated to the first 20,000 characters." }
      : {}),
  };
}
