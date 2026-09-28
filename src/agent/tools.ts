import { tool } from "ai";
import { z } from "zod";
import { NamespaceSchema } from "../api/namespace";
import {
  CHAOS_MODES,
  MAX_CHAOS_LATENCY_MS,
  chaosConfig,
} from "../gateway/chaos";
import { findRepoGateway } from "../gateway/lookup";
import { REGISTRY_NAME } from "../gateway/registry";
import type { RepoGateway } from "../gateway/repo-gateway";
import type { ReplayTarget } from "../gateway/replay-trigger";
import type { Namespace } from "../gateway/routes";
import { RepoInput, notARepo, parseRepo } from "./repo-input";
import {
  MAX_ROWS,
  chaosView,
  eventView,
  healthView,
  overviewView,
  queueView,
} from "./views";

export interface ToolContext {
  env: Env;
  namespace: () => Namespace;
}

type Gateway = DurableObjectStub<RepoGateway>;

const DEFAULT_EVENT_LIMIT = 10;

const LIVE_REFUSAL = {
  refused: true,
  reason:
    "Changing the live namespace from chat is not allowed. It needs the admin token, so use the admin API instead.",
};

const NamespaceInput = NamespaceSchema.optional().describe(
  "live or demo. Leave it out to use the current namespace.",
);

const RepoRequest = z.object({ namespace: NamespaceInput, repo: RepoInput });

export function createOpsTools(context: ToolContext) {
  const resolve = (namespace: Namespace | undefined) =>
    namespace ?? context.namespace();
  const notLive = (namespace: Namespace | undefined) =>
    resolve(namespace) !== "live";
  const onRepo = <T>(
    input: z.infer<typeof RepoRequest>,
    run: (gateway: Gateway, target: ReplayTarget) => Promise<T>,
  ) => withRepo(context.env, resolve(input.namespace), input.repo, run);

  return {
    getOverview: tool({
      description:
        "Totals for a whole namespace: requests, cache hits, upstream calls avoided, current chaos mode, and each repo with its breaker state. Use for questions about overall traffic or which repos exist.",
      inputSchema: z.object({ namespace: NamespaceInput }),
      execute: async ({ namespace }) => {
        const resolved = resolve(namespace);
        const registry = context.env.Registry.getByName(REGISTRY_NAME);
        const [overview, chaos] = await Promise.all([
          registry.overview(resolved),
          registry.getChaos(resolved),
        ]);
        return overviewView(overview, chaos);
      },
    }),
    getRepoHealth: tool({
      description:
        "Health of one repo: breaker state, gateway mode, upstream error rate and latency over the last minute, cache totals, and whether writes are paused. Use for questions like 'is demo/api healthy?'.",
      inputSchema: RepoRequest,
      execute: (input) =>
        onRepo(input, async (gateway, target) => ({
          ...repoLabel(target),
          ...healthView(await gateway.getHealth()),
        })),
    }),
    listQueue: tool({
      description: `Queued writes for one repo: counts per status (pending, in_flight, done, failed) and up to ${MAX_ROWS} newest items.`,
      inputSchema: RepoRequest,
      execute: (input) =>
        onRepo(input, async (gateway, target) => ({
          ...repoLabel(target),
          ...queueView(await gateway.listQueue()),
        })),
    }),
    getRecentEvents: tool({
      description:
        "Most recent gateway events for one repo, newest first: reads, writes, breaker changes and replays. Use for questions about what just happened to a repo.",
      inputSchema: RepoRequest.extend({
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_ROWS)
          .optional()
          .describe(`How many events, 1 to ${MAX_ROWS}. Default 10.`),
      }),
      execute: ({ limit, ...input }) =>
        onRepo(input, async (gateway, target) => ({
          ...repoLabel(target),
          events: (
            await gateway.getRecentEvents(limit ?? DEFAULT_EVENT_LIMIT)
          ).map(eventView),
        })),
    }),
    setChaos: tool({
      description:
        "Inject faults into upstream GitHub calls for a namespace. Modes: off, errors (a share of calls fail), latency (calls are slowed), blackout (every call fails). Only use when the user asks to start or stop chaos.",
      inputSchema: z.object({
        namespace: NamespaceInput,
        mode: z.enum(CHAOS_MODES),
        errorRate: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("For errors mode: share of calls to fail, 0 to 1."),
        latencyMs: z
          .number()
          .int()
          .min(0)
          .max(MAX_CHAOS_LATENCY_MS)
          .optional()
          .describe("For latency mode: extra delay in milliseconds."),
      }),
      needsApproval: ({ namespace }) => notLive(namespace),
      execute: async ({ namespace, mode, errorRate, latencyMs }) => {
        const resolved = resolve(namespace);
        if (resolved === "live") return LIVE_REFUSAL;
        const config = await context.env.Registry.getByName(
          REGISTRY_NAME,
        ).setChaos(resolved, chaosConfig(mode, errorRate, latencyMs));
        return { namespace: resolved, chaos: chaosView(config) };
      },
    }),
    setWritesPaused: tool({
      description:
        "Pause or resume replay of queued writes for one repo. Only use when the user asks to pause or resume writes.",
      inputSchema: RepoRequest.extend({ paused: z.boolean() }),
      needsApproval: ({ namespace }) => notLive(namespace),
      execute: ({ paused, ...input }) =>
        mutateRepo(input, (gateway, target) =>
          gateway.setWritesPaused(target, paused),
        ),
    }),
    triggerReplay: tool({
      description:
        "Start replaying queued writes for one repo now. Only use when the user asks to replay or flush the queue.",
      inputSchema: RepoRequest,
      needsApproval: ({ namespace }) => notLive(namespace),
      execute: (input) =>
        mutateRepo(input, (gateway, target) => gateway.triggerReplay(target)),
    }),
  };

  async function mutateRepo(
    input: z.infer<typeof RepoRequest>,
    run: (gateway: Gateway, target: ReplayTarget) => Promise<unknown>,
  ) {
    if (resolve(input.namespace) === "live") return LIVE_REFUSAL;
    return onRepo(input, async (gateway, target) => ({
      ...repoLabel(target),
      result: await run(gateway, target),
    }));
  }
}

async function withRepo<T>(
  env: Env,
  namespace: Namespace,
  repo: string,
  run: (gateway: Gateway, target: ReplayTarget) => Promise<T>,
): Promise<T | { error: string }> {
  const repoKey = parseRepo(repo);
  if (repoKey === null) return notARepo(repo);
  const target = { namespace, repoKey };
  const gateway = await findRepoGateway(env, target);
  if (!gateway) {
    return { error: `No traffic seen for ${namespace}/${repoKey} yet` };
  }
  return run(gateway, target);
}

function repoLabel({ namespace, repoKey }: ReplayTarget) {
  return { namespace, repo: repoKey };
}
