import { keyFromSecret, seal, unseal } from "../security/crypto";
import type { GatewayEvent } from "./events";
import type { GatewayMode } from "./guarded-upstream";
import {
  QueueControl,
  type QueueChange,
  type QueueListing,
} from "./queue-control";
import {
  QueueReplayer,
  type SendOutcome,
  type SettleDecision,
} from "./replay-sender";
import {
  ReplayTrigger,
  type ReplayTarget,
  type StartResult,
  type TriggerReason,
} from "./replay-trigger";
import type { GatewayRoute, Namespace } from "./routes";
import type { UpstreamResult } from "./upstream";
import { WritePath } from "./write-path";
import { WriteQueue, type QueuedWrite } from "./write-queue";

export interface WriteSideDeps {
  sql: SqlStorage;
  secret: string;
  workflow: Workflow<ReplayTarget>;
  upstream: (namespace: Namespace, request: Request) => Promise<UpstreamResult>;
  mode: () => GatewayMode;
  target: () => ReplayTarget | null;
  record: (event: Omit<GatewayEvent, "ts">) => void;
  waitUntil: (promise: Promise<unknown>) => void;
}

export interface PauseResult {
  paused: boolean;
  replay: StartResult | null;
}

export class WriteSide {
  private readonly queue: WriteQueue;
  private readonly writes: WritePath;
  private readonly replayer: QueueReplayer;
  private readonly trigger: ReplayTrigger;
  private readonly control: QueueControl;
  private keyPromise: Promise<CryptoKey> | null = null;

  constructor(private readonly deps: WriteSideDeps) {
    this.queue = new WriteQueue(deps.sql);
    this.control = new QueueControl(deps.sql);
    this.trigger = new ReplayTrigger(deps.sql, {
      hasWaiting: () => this.queue.hasWaiting(),
      runner: {
        create: async (params) => (await deps.workflow.create({ params })).id,
        status: (id) => instanceStatus(deps.workflow, id),
      },
      onStart: (instanceId, reason) =>
        this.note("replay_started", `${reason}: ${instanceId}`),
    });
    this.writes = new WritePath(this.queue, {
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
      mode: deps.mode,
      paused: () => this.trigger.paused(),
      onQueued: () => {
        if (deps.mode() === "normal") this.startInBackground("queued");
      },
      upstream: deps.upstream,
      sealToken: async (authorization) => seal(await this.key(), authorization),
    });
    this.replayer = new QueueReplayer(this.queue, {
      now: () => Date.now(),
      upstream: deps.upstream,
      unsealToken: async (sealed) => unseal(await this.key(), sealed),
      onSent: (write, result) => this.recordReplay(write, result),
    });
  }

  handle(request: Request, route: GatewayRoute): Promise<Response> {
    return this.writes.handle(request, route);
  }

  paused(): boolean {
    return this.trigger.paused();
  }

  claimBatch(): string[] {
    return this.trigger.paused() ? [] : this.replayer.claimBatch();
  }

  send(namespace: Namespace, id: string): Promise<SendOutcome> {
    return this.replayer.send(namespace, id);
  }

  settle(id: string): SettleDecision {
    return this.replayer.settle(id);
  }

  replay(target: ReplayTarget): Promise<StartResult> {
    return this.trigger.start(target, "manual");
  }

  async setPaused(target: ReplayTarget, paused: boolean): Promise<PauseResult> {
    if (paused !== this.trigger.paused()) {
      this.trigger.setPaused(paused);
      this.note("writes", paused ? "paused" : "resumed");
    }
    if (paused) return { paused, replay: null };
    return { paused, replay: await this.trigger.start(target, "resumed") };
  }

  listQueue(): QueueListing {
    return this.control.list();
  }

  retry(target: ReplayTarget, id: string): QueueChange {
    const change = this.control.retry(id, Date.now());
    if (change.ok) {
      this.note("queue", `retry ${id}`);
      if (this.deps.mode() === "normal") this.startFor(target, "retried");
    }
    return change;
  }

  drop(id: string): QueueChange {
    const change = this.control.drop(id, Date.now());
    if (change.ok) this.note("queue", `drop ${id}`);
    return change;
  }

  onRecovered(): void {
    this.startInBackground("recovered");
  }

  private startInBackground(reason: TriggerReason): void {
    const target = this.deps.target();
    if (target !== null) this.startFor(target, reason);
  }

  private startFor(target: ReplayTarget, reason: TriggerReason): void {
    this.deps.waitUntil(
      this.trigger.start(target, reason).catch(() => undefined),
    );
  }

  private key(): Promise<CryptoKey> {
    this.keyPromise ??= keyFromSecret(this.deps.secret);
    return this.keyPromise;
  }

  private recordReplay(write: QueuedWrite, result: UpstreamResult): void {
    this.deps.record({
      kind: "replay",
      method: write.method,
      path: write.path,
      status: result.status,
      cache: "QUEUED",
      latencyMs: result.latencyMs,
      detail: write.id,
    });
  }

  private note(kind: string, detail: string): void {
    this.deps.record({
      kind,
      method: "",
      path: "",
      status: 0,
      cache: "NONE",
      latencyMs: 0,
      detail,
    });
  }
}

async function instanceStatus(
  workflow: Workflow<ReplayTarget>,
  id: string,
): Promise<string | null> {
  try {
    return (await (await workflow.get(id)).status()).status;
  } catch {
    return null;
  }
}
