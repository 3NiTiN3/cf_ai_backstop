import { z } from "zod";
import type { SealedText } from "../security/crypto";

export const QUEUE_STATUSES = [
  "pending",
  "in_flight",
  "done",
  "failed",
  "dropped",
] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export interface QueuedWrite {
  id: string;
  seq: number;
  idempotencyKey: string;
  method: string;
  path: string;
  body: string;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  resultStatus: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewWrite {
  id: string;
  idempotencyKey: string;
  method: string;
  path: string;
  body: string;
  token: SealedText | null;
  now: number;
}

const WriteRow = z.object({
  id: z.string(),
  seq: z.number(),
  idempotency_key: z.string(),
  method: z.string(),
  path: z.string(),
  body: z.string(),
  status: z.enum(QUEUE_STATUSES),
  attempts: z.number(),
  last_error: z.string().nullable(),
  result_status: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

const TokenRow = z.object({
  token_ciphertext: z.string().nullable(),
  token_iv: z.string().nullable(),
});

const Count = z.object({ count: z.number() });

const ClaimedRow = z.object({ id: z.string(), seq: z.number() });

const WRITE_COLUMNS =
  "id, seq, idempotency_key, method, path, body, status, attempts, last_error, result_status, created_at, updated_at";

const WAITING = "status IN ('pending', 'in_flight')";

export class WriteQueue {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS write_queue (
      id TEXT PRIMARY KEY,
      seq INT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      body TEXT NOT NULL,
      token_ciphertext TEXT,
      token_iv TEXT,
      status TEXT NOT NULL,
      attempts INT NOT NULL,
      last_error TEXT,
      result_status INT,
      created_at INT NOT NULL,
      updated_at INT NOT NULL
    )`);
  }

  enqueue(write: NewWrite): QueuedWrite {
    this.sql.exec(
      `INSERT OR IGNORE INTO write_queue
        (id, seq, idempotency_key, method, path, body, token_ciphertext, token_iv,
         status, attempts, last_error, result_status, created_at, updated_at)
        VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM write_queue),
          ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?)`,
      write.id,
      write.idempotencyKey,
      write.method,
      write.path,
      write.body,
      write.token?.ciphertext ?? null,
      write.token?.iv ?? null,
      write.now,
      write.now,
    );
    const stored = this.findByKey(write.idempotencyKey);
    if (!stored) throw new Error("queued write was not stored");
    return stored;
  }

  findByKey(idempotencyKey: string): QueuedWrite | null {
    return this.one(
      `SELECT ${WRITE_COLUMNS} FROM write_queue WHERE idempotency_key = ?`,
      idempotencyKey,
    );
  }

  get(id: string): QueuedWrite | null {
    return this.one(
      `SELECT ${WRITE_COLUMNS} FROM write_queue WHERE id = ?`,
      id,
    );
  }

  // In-flight rows can only be left over from a replay run that died, because
  // one run at a time owns the queue, so they are claimed again in order.
  claim(limit: number, now: number): string[] {
    return this.sql
      .exec(
        `UPDATE write_queue SET status = 'in_flight', updated_at = ?
          WHERE id IN (SELECT id FROM write_queue WHERE ${WAITING} ORDER BY seq LIMIT ?)
          RETURNING id, seq`,
        now,
        limit,
      )
      .toArray()
      .map((row) => ClaimedRow.parse(row))
      .sort((a, b) => a.seq - b.seq)
      .map((row) => row.id);
  }

  releaseInFlight(now: number): void {
    this.sql.exec(
      "UPDATE write_queue SET status = 'pending', updated_at = ? WHERE status = 'in_flight'",
      now,
    );
  }

  noteAttempt(id: string, error: string, now: number): void {
    this.sql.exec(
      "UPDATE write_queue SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?",
      error,
      now,
      id,
    );
  }

  markFailed(
    id: string,
    resultStatus: number | null,
    error: string,
    now: number,
  ): void {
    this.sql.exec(
      `UPDATE write_queue SET status = 'failed', attempts = attempts + 1,
        result_status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
      resultStatus,
      error,
      now,
      id,
    );
  }

  position(write: QueuedWrite): number {
    if (write.status !== "pending" && write.status !== "in_flight") return 0;
    const row = this.sql
      .exec(
        `SELECT COUNT(*) AS count FROM write_queue WHERE ${WAITING} AND seq <= ?`,
        write.seq,
      )
      .one();
    return Count.parse(row).count;
  }

  hasWaiting(): boolean {
    const row = this.sql
      .exec(`SELECT COUNT(*) AS count FROM write_queue WHERE ${WAITING}`)
      .one();
    return Count.parse(row).count > 0;
  }

  sealedToken(id: string): SealedText | null {
    const row = this.sql
      .exec(
        "SELECT token_ciphertext, token_iv FROM write_queue WHERE id = ?",
        id,
      )
      .toArray()[0];
    if (!row) return null;
    const { token_ciphertext, token_iv } = TokenRow.parse(row);
    if (token_ciphertext === null || token_iv === null) return null;
    return { ciphertext: token_ciphertext, iv: token_iv };
  }

  markDone(id: string, resultStatus: number, now: number): void {
    this.sql.exec(
      `UPDATE write_queue SET status = 'done', attempts = attempts + 1,
        result_status = ?, last_error = NULL,
        token_ciphertext = NULL, token_iv = NULL, updated_at = ? WHERE id = ?`,
      resultStatus,
      now,
      id,
    );
  }

  private one(query: string, binding: string): QueuedWrite | null {
    const row = this.sql.exec(query, binding).toArray()[0];
    return row ? toWrite(WriteRow.parse(row)) : null;
  }
}

function toWrite(row: z.infer<typeof WriteRow>): QueuedWrite {
  return {
    id: row.id,
    seq: row.seq,
    idempotencyKey: row.idempotency_key,
    method: row.method,
    path: row.path,
    body: row.body,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    resultStatus: row.result_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
