import { z } from "zod";
import { planTick, type PlannedRequest } from "./traffic-plan";

export const TICK_MS = 1000;

export interface TrafficStatus {
  running: boolean;
  agents: number;
  startedAt: number | null;
  endsAt: number | null;
  ticks: number;
  requestsSent: number;
}

export type StartResult =
  { ok: true; status: TrafficStatus } | { ok: false; status: TrafficStatus };

export interface TrafficDeps {
  now: () => number;
  random: () => number;
  send: (request: PlannedRequest) => Promise<void>;
  schedule: (at: number) => Promise<void>;
}

const RunRow = z.object({
  agents: z.number(),
  started_at: z.number(),
  ends_at: z.number(),
  ticks: z.number(),
  sent: z.number(),
});

const IDLE: TrafficStatus = {
  running: false,
  agents: 0,
  startedAt: null,
  endsAt: null,
  ticks: 0,
  requestsSent: 0,
};

export class TrafficRunner {
  constructor(
    private readonly sql: SqlStorage,
    private readonly deps: TrafficDeps,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS demo_traffic (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      agents INT NOT NULL,
      started_at INT NOT NULL,
      ends_at INT NOT NULL,
      ticks INT NOT NULL,
      sent INT NOT NULL
    )`);
  }

  async start(agents: number, durationSeconds: number): Promise<StartResult> {
    if (this.status().running) return { ok: false, status: this.status() };
    const now = this.deps.now();
    this.sql.exec(
      `INSERT OR REPLACE INTO demo_traffic (id, agents, started_at, ends_at, ticks, sent)
        VALUES (1, ?, ?, ?, 0, 0)`,
      agents,
      now,
      now + durationSeconds * 1000,
    );
    await this.deps.schedule(now + TICK_MS);
    return { ok: true, status: this.status() };
  }

  stop(): TrafficStatus {
    this.sql.exec("DELETE FROM demo_traffic");
    return IDLE;
  }

  status(): TrafficStatus {
    const row = this.sql.exec("SELECT * FROM demo_traffic").toArray()[0];
    if (!row) return IDLE;
    const run = RunRow.parse(row);
    return {
      running: true,
      agents: run.agents,
      startedAt: run.started_at,
      endsAt: run.ends_at,
      ticks: run.ticks,
      requestsSent: run.sent,
    };
  }

  async tick(): Promise<boolean> {
    const status = this.status();
    if (!status.running) return false;
    if (status.endsAt !== null && this.deps.now() >= status.endsAt) {
      this.stop();
      return false;
    }
    const planned = planTick(status.agents, status.ticks, this.deps.random);
    await Promise.allSettled(planned.map((request) => this.deps.send(request)));
    this.sql.exec(
      "UPDATE demo_traffic SET ticks = ticks + 1, sent = sent + ?",
      planned.length,
    );
    return true;
  }
}
