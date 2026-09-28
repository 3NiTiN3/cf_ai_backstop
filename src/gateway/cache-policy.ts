const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const MAX_CACHED_BYTES = 1024 * 1024;

const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const CONTENTS = /^\/repos\/[^/]+\/[^/]+\/contents(\/|$)/;
const COMMIT_BY_SHA = /^\/repos\/[^/]+\/[^/]+\/commits\/[0-9a-f]{40}$/i;
const REPO_METADATA = /^\/repos\/[^/]+\/[^/]+\/?$/;
const LIST =
  /^\/repos\/[^/]+\/[^/]+(\/[^/]+\/[^/]+)?\/(pulls|issues|commits|comments|branches|tags|releases|labels|status|statuses|check-runs)\/?$/;

interface TtlRule {
  matches: (path: string, query: URLSearchParams) => boolean;
  ttlMs: number;
}

const TTL_RULES: TtlRule[] = [
  {
    matches: (path, query) =>
      CONTENTS.test(path) && COMMIT_SHA.test(query.get("ref") ?? ""),
    ttlMs: 24 * HOUR,
  },
  { matches: (path) => COMMIT_BY_SHA.test(path), ttlMs: 24 * HOUR },
  { matches: (path) => REPO_METADATA.test(path), ttlMs: MINUTE },
  {
    matches: (path) => !CONTENTS.test(path) && LIST.test(path),
    ttlMs: 15 * SECOND,
  },
];

const DEFAULT_TTL_MS = 30 * SECOND;

export function ttlFor(path: string, query: URLSearchParams): number {
  const rule = TTL_RULES.find((candidate) => candidate.matches(path, query));
  return rule?.ttlMs ?? DEFAULT_TTL_MS;
}

export function isCacheable(method: string, status: number, body: string) {
  return (
    method === "GET" &&
    status === 200 &&
    new TextEncoder().encode(body).byteLength < MAX_CACHED_BYTES
  );
}
