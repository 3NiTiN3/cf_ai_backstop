import { z } from "zod";
import {
  QUEUE_STATUSES,
  type QueueStatus,
  type QueuedWrite,
} from "./write-queue";

export type QueueItem = Omit<QueuedWrite, "body" | "idempotencyKey">;

export interface QueueListing {
  counts: Record<QueueStatus, number>;
  items: QueueItem[];
}

export type QueueChange =
  | { ok: true; item: QueueItem }
  | { ok: false; status: 404 | 409; message: string };

const ItemRow = z.object({
  id: z.string(),
  seq: z.number(),
  method: z.string(),
  path: z.string(),
  status: z.enum(QUEUE_STATUSES),
  attempts: z.number(),
  last_error: z.string().nullable(),
  result_status: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

const CountRow = z.object({
  status: z.enum(QUEUE_STATUSES),
  count: z.number(),
});

const ITEM_COLUMNS =
  "id, seq, method, path, status, attempts, last_error, result_status, created_at, updated_at";

const LIST_LIMIT = 100;

export class QueueControl {
  constructor(private readonly sql: SqlStorage) {}

  list(): QueueListing {
    const items = this.sql
      .exec(
        `SELECT ${ITEM_COLUMNS} FROM write_queue ORDER BY seq DESC LIMIT ?`,
        LIST_LIMIT,
      )
      .toArray()
      .map((row) => toItem(ItemRow.parse(row)));
    return { counts: this.counts(), items };
  }

  retry(id: string, now: number): QueueChange {
    return this.change(id, ["failed"], "retried", () =>
      this.sql.exec(
        "UPDATE write_queue SET status = 'pending', updated_at = ? WHERE id = ?",
        now,
        id,
      ),
    );
  }

  drop(id: string, now: number): QueueChange {
    return this.change(id, ["pending", "failed"], "dropped", () =>
      this.sql.exec(
        `UPDATE write_queue SET status = 'dropped', updated_at = ?,
          token_ciphertext = NULL, token_iv = NULL WHERE id = ?`,
        now,
        id,
      ),
    );
  }

  private change(
    id: string,
    allowed: QueueStatus[],
    verb: string,
    apply: () => void,
  ): QueueChange {
    const current = this.item(id);
    if (!current) return { ok: false, status: 404, message: "No such write" };
    if (!allowed.includes(current.status)) {
      return {
        ok: false,
        status: 409,
        message: `Only ${allowed.join(" or ")} writes can be ${verb}`,
      };
    }
    apply();
    return { ok: true, item: this.item(id) ?? current };
  }

  private item(id: string): QueueItem | null {
    const row = this.sql
      .exec(`SELECT ${ITEM_COLUMNS} FROM write_queue WHERE id = ?`, id)
      .toArray()[0];
    return row ? toItem(ItemRow.parse(row)) : null;
  }

  private counts(): Record<QueueStatus, number> {
    const counts = Object.fromEntries(
      QUEUE_STATUSES.map((status) => [status, 0]),
    ) as Record<QueueStatus, number>;
    const rows = this.sql.exec(
      "SELECT status, COUNT(*) AS count FROM write_queue GROUP BY status",
    );
    for (const row of rows) {
      const { status, count } = CountRow.parse(row);
      counts[status] = count;
    }
    return counts;
  }
}

function toItem(row: z.infer<typeof ItemRow>): QueueItem {
  return {
    id: row.id,
    seq: row.seq,
    method: row.method,
    path: row.path,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    resultStatus: row.result_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
