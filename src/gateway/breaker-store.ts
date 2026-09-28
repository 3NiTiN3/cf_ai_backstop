import { z } from "zod";
import {
  BREAKER_STATES,
  INITIAL_BREAKER,
  TRANSITION_REASONS,
  type Breaker,
} from "./breaker";

const StoredBreaker = z.object({
  state: z.enum(BREAKER_STATES),
  openUntil: z.number().nullable(),
  openDurationMs: z.number(),
  reason: z.enum(TRANSITION_REASONS).nullable(),
  probeStartedAt: z.number().nullable(),
});

const BreakerRow = z.object({ data: z.string() });

export class BreakerStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS breaker (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    )`);
  }

  load(): Breaker {
    const row = this.sql
      .exec("SELECT data FROM breaker WHERE id = 1")
      .toArray()[0];
    if (row === undefined) return INITIAL_BREAKER;
    const parsed = StoredBreaker.safeParse(
      JSON.parse(BreakerRow.parse(row).data),
    );
    return parsed.success ? parsed.data : INITIAL_BREAKER;
  }

  save(breaker: Breaker): void {
    this.sql.exec(
      "INSERT OR REPLACE INTO breaker (id, data) VALUES (1, ?)",
      JSON.stringify(breaker),
    );
  }
}
