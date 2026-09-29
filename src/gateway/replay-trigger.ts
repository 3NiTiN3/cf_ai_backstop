import { z } from "zod";
import type { Namespace } from "./routes";

export interface ReplayTarget {
  namespace: Namespace;
  repoKey: string;
}

export type TriggerReason =
  "recovered" | "manual" | "resumed" | "queued" | "retried";

export type StartResult =
  | { started: true; instanceId: string }
  | { started: false; reason: "paused" | "empty" }
  | { started: false; reason: "running"; instanceId: string };

interface ReplayRunner {
  create: (target: ReplayTarget) => Promise<string>;
  status: (instanceId: string) => Promise<string | null>;
}

export interface TriggerDeps {
  hasWaiting: () => boolean;
  runner: ReplayRunner;
  onStart: (instanceId: string, reason: TriggerReason) => void;
}

const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "waiting",
  "paused",
  "waitingForPause",
]);

const ControlRow = z.object({
  paused: z.number(),
  instance_id: z.string().nullable(),
});

export class ReplayTrigger {
  private starting: Promise<StartResult> | null = null;

  constructor(
    private readonly sql: SqlStorage,
    private readonly deps: TriggerDeps,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS replay_control (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      paused INT NOT NULL,
      instance_id TEXT
    )`);
    sql.exec(
      "INSERT OR IGNORE INTO replay_control (id, paused, instance_id) VALUES (1, 0, NULL)",
    );
  }

  paused(): boolean {
    return this.control().paused === 1;
  }

  setPaused(paused: boolean): void {
    this.sql.exec(
      "UPDATE replay_control SET paused = ? WHERE id = 1",
      paused ? 1 : 0,
    );
  }

  // Concurrent callers share one attempt, so two status checks cannot both
  // see no active run and start two instances.
  start(target: ReplayTarget, reason: TriggerReason): Promise<StartResult> {
    this.starting ??= this.tryStart(target, reason).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async tryStart(
    target: ReplayTarget,
    reason: TriggerReason,
  ): Promise<StartResult> {
    if (this.paused()) return { started: false, reason: "paused" };
    if (!this.deps.hasWaiting()) return { started: false, reason: "empty" };
    const current = this.control().instance_id;
    if (current !== null && (await this.isActive(current))) {
      return { started: false, reason: "running", instanceId: current };
    }
    const instanceId = await this.deps.runner.create({
      namespace: target.namespace,
      repoKey: target.repoKey,
    });
    this.sql.exec(
      "UPDATE replay_control SET instance_id = ? WHERE id = 1",
      instanceId,
    );
    this.deps.onStart(instanceId, reason);
    return { started: true, instanceId };
  }

  private async isActive(instanceId: string): Promise<boolean> {
    const status = await this.deps.runner.status(instanceId);
    return status !== null && ACTIVE_STATUSES.has(status);
  }

  private control(): z.infer<typeof ControlRow> {
    return ControlRow.parse(
      this.sql
        .exec("SELECT paused, instance_id FROM replay_control WHERE id = 1")
        .one(),
    );
  }
}
