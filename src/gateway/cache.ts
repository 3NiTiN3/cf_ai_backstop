import { z } from "zod";
import { sha256Hex } from "../shared/hash";
import type { GatewayRoute } from "./routes";

export interface CacheEntry {
  key: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  etag: string | null;
  lastModified: string | null;
  fetchedAt: number;
  expiresAt: number;
  hits: number;
}

const PUBLIC_SCOPE = "public";

const StoredHeaders = z.record(z.string(), z.string());

const CacheRow = z.object({
  key: z.string(),
  status: z.number(),
  headers: z.string(),
  body: z.string(),
  etag: z.string().nullable(),
  last_modified: z.string().nullable(),
  fetched_at: z.number(),
  expires_at: z.number(),
  hits: z.number(),
});

export class CacheStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS cache_entries (
      key TEXT PRIMARY KEY,
      status INT,
      headers TEXT,
      body TEXT,
      etag TEXT,
      last_modified TEXT,
      fetched_at INT,
      expires_at INT,
      hits INT
    )`);
  }

  get(key: string): CacheEntry | null {
    const row = this.sql
      .exec("SELECT * FROM cache_entries WHERE key = ?", key)
      .toArray()[0];
    return row ? toEntry(CacheRow.parse(row)) : null;
  }

  put(entry: Omit<CacheEntry, "hits">): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO cache_entries
        (key, status, headers, body, etag, last_modified, fetched_at, expires_at, hits)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      entry.key,
      entry.status,
      JSON.stringify(entry.headers),
      entry.body,
      entry.etag,
      entry.lastModified,
      entry.fetchedAt,
      entry.expiresAt,
    );
  }

  recordHit(key: string): void {
    this.sql.exec(
      "UPDATE cache_entries SET hits = hits + 1 WHERE key = ?",
      key,
    );
  }
}

export async function cacheKey(
  request: Request,
  route: GatewayRoute,
): Promise<string> {
  const query = [...new URLSearchParams(route.search)]
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  const accept = request.headers.get("accept") ?? "";
  const scope = await authScope(request.headers.get("authorization"));
  return JSON.stringify([
    request.method,
    route.upstreamPath,
    query,
    accept,
    scope,
  ]);
}

async function authScope(authorization: string | null): Promise<string> {
  if (!authorization) return PUBLIC_SCOPE;
  const token = authorization.replace(/^(bearer|token)\s+/i, "").trim();
  return (await sha256Hex(token)).slice(0, 16);
}

function toEntry(row: z.infer<typeof CacheRow>): CacheEntry {
  return {
    key: row.key,
    status: row.status,
    headers: StoredHeaders.parse(JSON.parse(row.headers)),
    body: row.body,
    etag: row.etag,
    lastModified: row.last_modified,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
    hits: row.hits,
  };
}
