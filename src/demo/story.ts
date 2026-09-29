import { z } from "zod";
import type { ChaosMode } from "../gateway/chaos";
import type { Overview } from "../gateway/overview";
import { DEMO_REPOS } from "./traffic-plan";

export const STORY_STEPS = [
  "normal",
  "outage",
  "recovery",
  "replayed",
] as const;
export type StoryStep = (typeof STORY_STEPS)[number];

export const NORMAL_MS = 20_000;
export const OUTAGE_MS = 30_000;
export const RECOVERY_MAX_MS = 40_000;
export const STORY_AGENTS = 10;
const TRAFFIC_SECONDS =
  Math.ceil((NORMAL_MS + OUTAGE_MS + RECOVERY_MAX_MS) / 1000) + 5;

export interface StoryStatus {
  step: StoryStep | "idle";
  running: boolean;
  startedAt: number | null;
  stepStartedAt: number | null;
  finishedAt: number | null;
}

export interface StoryHealth {
  queueDepth: number;
  reposDegraded: number;
}

export interface StoryDeps {
  now: () => number;
  setChaos: (mode: ChaosMode) => void;
  startTraffic: (agents: number, durationSeconds: number) => Promise<void>;
  stopTraffic: () => void;
  health: () => StoryHealth;
  schedule: (at: number) => Promise<void>;
}

export function storyHealth({ repos }: Pick<Overview, "repos">): StoryHealth {
  const storyRepos = repos.filter((repo) =>
    (DEMO_REPOS as readonly string[]).includes(repo.repoKey),
  );
  return {
    queueDepth: storyRepos.reduce((sum, repo) => sum + repo.queueDepth, 0),
    reposDegraded: storyRepos.filter((repo) => repo.breaker !== "closed")
      .length,
  };
}

const StoryRow = z.object({
  step: z.enum(STORY_STEPS),
  started_at: z.number(),
  step_started_at: z.number(),
  finished_at: z.number().nullable(),
});

const IDLE: StoryStatus = {
  step: "idle",
  running: false,
  startedAt: null,
  stepStartedAt: null,
  finishedAt: null,
};

export class StoryRunner {
  constructor(
    private readonly sql: SqlStorage,
    private readonly deps: StoryDeps,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS demo_story (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      step TEXT NOT NULL,
      started_at INT NOT NULL,
      step_started_at INT NOT NULL,
      finished_at INT
    )`);
  }

  async start(): Promise<{ ok: boolean; status: StoryStatus }> {
    if (this.status().running) return { ok: false, status: this.status() };
    const now = this.deps.now();
    this.sql.exec(
      `INSERT OR REPLACE INTO demo_story (id, step, started_at, step_started_at, finished_at)
        VALUES (1, 'normal', ?, ?, NULL)`,
      now,
      now,
    );
    this.deps.setChaos("off");
    this.deps.stopTraffic();
    await this.deps.startTraffic(STORY_AGENTS, TRAFFIC_SECONDS);
    await this.deps.schedule(now + 1000);
    return { ok: true, status: this.status() };
  }

  stop(): StoryStatus {
    if (this.status().running) {
      this.deps.setChaos("off");
      this.deps.stopTraffic();
    }
    this.sql.exec("DELETE FROM demo_story");
    return IDLE;
  }

  status(): StoryStatus {
    const row = this.sql.exec("SELECT * FROM demo_story").toArray()[0];
    if (!row) return IDLE;
    const story = StoryRow.parse(row);
    return {
      step: story.step,
      running: story.step !== "replayed",
      startedAt: story.started_at,
      stepStartedAt: story.step_started_at,
      finishedAt: story.finished_at,
    };
  }

  tick(): boolean {
    const status = this.status();
    if (!status.running || status.stepStartedAt === null) return false;
    const inStep = this.deps.now() - status.stepStartedAt;
    if (status.step === "normal" && inStep >= NORMAL_MS) {
      this.deps.setChaos("blackout");
      this.moveTo("outage");
    } else if (status.step === "outage" && inStep >= OUTAGE_MS) {
      this.deps.setChaos("off");
      this.moveTo("recovery");
    } else if (status.step === "recovery" && this.recovered(inStep)) {
      this.deps.stopTraffic();
      this.moveTo("replayed");
      return false;
    }
    return true;
  }

  private recovered(inStep: number): boolean {
    const { queueDepth, reposDegraded } = this.deps.health();
    const drained = queueDepth === 0 && reposDegraded === 0;
    return drained || inStep >= RECOVERY_MAX_MS;
  }

  private moveTo(step: StoryStep): void {
    const now = this.deps.now();
    this.sql.exec(
      "UPDATE demo_story SET step = ?, step_started_at = ?, finished_at = ?",
      step,
      now,
      step === "replayed" ? now : null,
    );
  }
}
