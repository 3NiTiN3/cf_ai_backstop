import { z } from "zod";
import type { GatewayEvent } from "./events";

export interface Incident {
  id: string;
  startedAt: number;
  endedAt: number | null;
  peakErrorRate: number;
  readsServedStale: number;
  writesQueued: number;
  writesReplayed: number;
  summary: string | null;
}

export type ClosedIncident = Incident & { endedAt: number };

export type ReplayProgress = "nothing queued" | "under way" | "completed";

export function replayProgress({
  writesQueued,
  writesReplayed,
}: Pick<Incident, "writesQueued" | "writesReplayed">): ReplayProgress {
  if (writesQueued === 0) return "nothing queued";
  return writesReplayed >= writesQueued ? "completed" : "under way";
}

const MAX_INCIDENTS = 200;

const IncidentRow = z.object({
  id: z.string(),
  started_at: z.number(),
  ended_at: z.number().nullable(),
  peak_error_rate: z.number(),
  reads_served_stale: z.number(),
  writes_queued: z.number(),
  writes_replayed: z.number(),
  summary: z.string().nullable(),
});

export class IncidentLog {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      started_at INT NOT NULL,
      ended_at INT,
      peak_error_rate REAL NOT NULL,
      reads_served_stale INT NOT NULL DEFAULT 0,
      writes_queued INT NOT NULL DEFAULT 0,
      writes_replayed INT NOT NULL DEFAULT 0,
      summary TEXT
    )`);
  }

  open(at: number, errorRate: number): void {
    if (this.current()) return;
    this.sql.exec(
      "INSERT INTO incidents (id, started_at, peak_error_rate) VALUES (?, ?, ?)",
      crypto.randomUUID(),
      at,
      errorRate,
    );
    this.prune();
  }

  close(at: number): ClosedIncident | null {
    const open = this.current();
    if (!open) return null;
    this.sql.exec(
      "UPDATE incidents SET ended_at = ? WHERE id = ?",
      at,
      open.id,
    );
    return { ...open, endedAt: at };
  }

  observe(event: GatewayEvent, errorRate: number): void {
    const open = this.current();
    if (open) {
      this.sql.exec(
        `UPDATE incidents SET
          peak_error_rate = MAX(peak_error_rate, ?),
          reads_served_stale = reads_served_stale + ?,
          writes_queued = writes_queued + ?
          WHERE id = ?`,
        errorRate,
        event.kind === "read" && event.cache === "STALE" ? 1 : 0,
        event.kind === "write" && event.cache === "QUEUED" ? 1 : 0,
        open.id,
      );
    }
    if (isReplayed(event)) {
      this.sql.exec(
        `UPDATE incidents SET writes_replayed = writes_replayed + 1
          WHERE id = (SELECT id FROM incidents ORDER BY started_at DESC LIMIT 1)`,
      );
    }
  }

  setSummary(id: string, summary: string): void {
    this.sql.exec("UPDATE incidents SET summary = ? WHERE id = ?", summary, id);
  }

  list(limit: number): Incident[] {
    return this.sql
      .exec("SELECT * FROM incidents ORDER BY started_at DESC LIMIT ?", limit)
      .toArray()
      .map((row) => toIncident(IncidentRow.parse(row)));
  }

  private current(): Incident | null {
    const row = this.sql
      .exec("SELECT * FROM incidents WHERE ended_at IS NULL LIMIT 1")
      .toArray()[0];
    return row === undefined ? null : toIncident(IncidentRow.parse(row));
  }

  private prune(): void {
    this.sql.exec(
      `DELETE FROM incidents WHERE id NOT IN
        (SELECT id FROM incidents ORDER BY started_at DESC LIMIT ?)`,
      MAX_INCIDENTS,
    );
  }
}

function isReplayed(event: GatewayEvent): boolean {
  return event.kind === "replay" && event.status >= 200 && event.status < 300;
}

function toIncident(row: z.infer<typeof IncidentRow>): Incident {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    peakErrorRate: row.peak_error_rate,
    readsServedStale: row.reads_served_stale,
    writesQueued: row.writes_queued,
    writesReplayed: row.writes_replayed,
    summary: row.summary,
  };
}
