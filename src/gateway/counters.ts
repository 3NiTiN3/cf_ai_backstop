import { z } from "zod";

export const COUNTER_NAMES = [
  "upstream_calls",
  "upstream_avoided",
  "revalidated",
] as const;

export type CounterName = (typeof COUNTER_NAMES)[number];

const CounterRow = z.object({ name: z.string(), value: z.number() });

export class Counters {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INT NOT NULL)",
    );
  }

  increment(name: CounterName, by = 1): void {
    this.sql.exec(
      `INSERT INTO counters (name, value) VALUES (?, ?)
        ON CONFLICT(name) DO UPDATE SET value = value + excluded.value`,
      name,
      by,
    );
  }

  snapshot(): Record<CounterName, number> {
    const totals = Object.fromEntries(
      COUNTER_NAMES.map((name) => [name, 0]),
    ) as Record<CounterName, number>;
    for (const row of this.sql.exec("SELECT name, value FROM counters")) {
      const { name, value } = CounterRow.parse(row);
      if (isCounterName(name)) totals[name] = value;
    }
    return totals;
  }
}

function isCounterName(name: string): name is CounterName {
  return (COUNTER_NAMES as readonly string[]).includes(name);
}
