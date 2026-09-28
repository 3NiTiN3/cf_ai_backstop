import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { RepoGateway } from "../gateway/repo-gateway";
import { durableObjectName, type Namespace } from "../gateway/routes";

export interface ReplayParams {
  namespace: Namespace;
  repoKey: string;
}

export interface ReplaySummary {
  sent: number;
  failed: number;
  stopped: boolean;
}

type Gateway = DurableObjectStub<RepoGateway>;

const SEND_CONFIG = {
  retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
  timeout: "30 seconds",
} satisfies WorkflowStepConfig;

export class ReplayWorkflow extends WorkflowEntrypoint<Env, ReplayParams> {
  override async run(
    event: Readonly<WorkflowEvent<ReplayParams>>,
    step: WorkflowStep,
  ): Promise<ReplaySummary> {
    const gateway = this.env.RepoGateway.getByName(
      durableObjectName(event.payload),
    );
    const summary: ReplaySummary = { sent: 0, failed: 0, stopped: false };
    for (let batch = 1; ; batch++) {
      const ids = await step.do(`claim batch ${batch}`, () =>
        gateway.claimReplayBatch(),
      );
      if (ids.length === 0) return summary;
      for (const id of ids) {
        const sent = await sendOne(step, gateway, event.payload.namespace, id);
        if (sent === "stop") return { ...summary, stopped: true };
        summary[sent]++;
      }
    }
  }
}

async function sendOne(
  step: WorkflowStep,
  gateway: Gateway,
  namespace: Namespace,
  id: string,
): Promise<"sent" | "failed" | "stop"> {
  try {
    await step.do(`send ${id}`, SEND_CONFIG, async () => {
      const outcome = await gateway.sendQueuedWrite(namespace, id);
      if (outcome.kind === "retry") throw new Error(outcome.error);
      if (outcome.kind === "failed") throw new NonRetryableError(outcome.error);
      return outcome.kind;
    });
    return "sent";
  } catch {
    const decision = await step.do(`settle ${id}`, () =>
      gateway.settleQueuedWrite(id),
    );
    return decision === "stop" ? "stop" : "failed";
  }
}
