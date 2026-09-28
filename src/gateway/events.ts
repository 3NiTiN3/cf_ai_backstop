import { z } from "zod";
import { addColumnIfMissing } from "../shared/sql";

export interface GatewayEvent {
  ts: number;
  kind: string;
  method: string;
  path: string;
  status: number;
  cache: string;
  latencyMs: number;
  detail?: string;
}

const MAX_EVENTS = 2000;

const EventRow = z.object({
  ts: z.number(),
  kind: z.string(),
  method: z.string(),
  path: z.string(),
  status: z.number(),
  cache: z.string(),
  latency_ms: z.number(),
  detail: z.string().nullable(),
});

const InsertedId = z.object({ id: z.number() });

export class EventLog {
  constructor(
    private readonly sql: SqlStorage,
    private readonly maxEvents = MAX_EVENTS,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INT NOT NULL,
      kind TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INT NOT NULL,
      cache TEXT NOT NULL,
      latency_ms INT NOT NULL
    )`);
    addColumnIfMissing(sql, "events", "detail", "TEXT");
  }

  record(event: GatewayEvent): void {
    const inserted = this.sql
      .exec(
        `INSERT INTO events
          (ts, kind, method, path, status, cache, latency_ms, detail)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        event.ts,
        event.kind,
        event.method,
        event.path,
        event.status,
        event.cache,
        event.latencyMs,
        event.detail ?? null,
      )
      .one();
    const { id } = InsertedId.parse(inserted);
    this.sql.exec("DELETE FROM events WHERE id <= ?", id - this.maxEvents);
  }

  recent(limit: number): GatewayEvent[] {
    return this.sql
      .exec(
        "SELECT ts, kind, method, path, status, cache, latency_ms, detail FROM events ORDER BY id DESC LIMIT ?",
        limit,
      )
      .toArray()
      .map((row) => {
        const { latency_ms, detail, ...rest } = EventRow.parse(row);
        return {
          ...rest,
          latencyMs: latency_ms,
          ...(detail === null ? {} : { detail }),
        };
      });
  }

  lastEventAt(): number | null {
    return this.recent(1)[0]?.ts ?? null;
  }
}
