import { z } from "zod";
import { CHAOS_MODES, CHAOS_OFF, type ChaosConfig } from "./chaos";
import type { Namespace } from "./routes";

export interface ChaosEvent extends ChaosConfig {
  ts: number;
}

const MAX_EVENTS_PER_NAMESPACE = 200;

const ConfigRow = z.object({
  mode: z.enum(CHAOS_MODES),
  error_rate: z.number(),
  latency_ms: z.number(),
});

const EventRow = ConfigRow.extend({ ts: z.number() });

export class ChaosStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS chaos (
      namespace TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      error_rate REAL NOT NULL,
      latency_ms INT NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS chaos_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      namespace TEXT NOT NULL,
      ts INT NOT NULL,
      mode TEXT NOT NULL,
      error_rate REAL NOT NULL,
      latency_ms INT NOT NULL
    )`);
  }

  get(namespace: Namespace): ChaosConfig {
    const row = this.sql
      .exec(
        "SELECT mode, error_rate, latency_ms FROM chaos WHERE namespace = ?",
        namespace,
      )
      .toArray()[0];
    return row === undefined ? CHAOS_OFF : toConfig(ConfigRow.parse(row));
  }

  set(namespace: Namespace, config: ChaosConfig, now: number): void {
    if (sameConfig(this.get(namespace), config)) return;
    this.sql.exec(
      `INSERT OR REPLACE INTO chaos (namespace, mode, error_rate, latency_ms)
        VALUES (?, ?, ?, ?)`,
      namespace,
      config.mode,
      config.errorRate,
      config.latencyMs,
    );
    this.sql.exec(
      `INSERT INTO chaos_events (namespace, ts, mode, error_rate, latency_ms)
        VALUES (?, ?, ?, ?, ?)`,
      namespace,
      now,
      config.mode,
      config.errorRate,
      config.latencyMs,
    );
    this.sql.exec(
      `DELETE FROM chaos_events WHERE namespace = ? AND id NOT IN (
        SELECT id FROM chaos_events WHERE namespace = ? ORDER BY id DESC LIMIT ?
      )`,
      namespace,
      namespace,
      MAX_EVENTS_PER_NAMESPACE,
    );
  }

  events(namespace: Namespace, limit: number): ChaosEvent[] {
    return this.sql
      .exec(
        `SELECT ts, mode, error_rate, latency_ms FROM chaos_events
          WHERE namespace = ? ORDER BY id DESC LIMIT ?`,
        namespace,
        limit,
      )
      .toArray()
      .map((row) => {
        const parsed = EventRow.parse(row);
        return { ts: parsed.ts, ...toConfig(parsed) };
      });
  }
}

function toConfig(row: z.infer<typeof ConfigRow>): ChaosConfig {
  return {
    mode: row.mode,
    errorRate: row.error_rate,
    latencyMs: row.latency_ms,
  };
}

function sameConfig(a: ChaosConfig, b: ChaosConfig): boolean {
  return (
    a.mode === b.mode &&
    a.errorRate === b.errorRate &&
    a.latencyMs === b.latencyMs
  );
}
