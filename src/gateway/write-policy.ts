export type WriteClass =
  | { queueable: true }
  | { queueable: false; reason: string };

interface QueueableWrite {
  pattern: RegExp;
  accepts: (body: string) => boolean;
}

const REPO = "/repos/[^/]+/[^/]+";
const NUMBER = "[1-9][0-9]*";
const FULL_SHA = "[0-9a-fA-F]{40}";

const QUEUEABLE: QueueableWrite[] = [
  { pattern: new RegExp(`^${REPO}/issues$`), accepts: () => true },
  {
    pattern: new RegExp(`^${REPO}/issues/${NUMBER}/(comments|labels)$`),
    accepts: () => true,
  },
  {
    pattern: new RegExp(`^${REPO}/statuses/${FULL_SHA}$`),
    accepts: () => true,
  },
  {
    pattern: new RegExp(`^${REPO}/pulls/${NUMBER}/reviews$`),
    accepts: isCommentReview,
  },
];

const REASONS = {
  notPost:
    "Updates and deletes depend on the current state, so replaying them later could overwrite newer changes.",
  merge:
    "Merging has side effects that must happen now or not at all, so it is never delayed.",
  review:
    "Only COMMENT reviews can be delayed. Approvals and change requests must match the code at the time they were written.",
  statusRef:
    "Statuses can only be queued for a full commit SHA. A branch or short ref could point at a different commit by the time it replays.",
  other:
    "This write is not on the list of writes that are safe to delay, because its ordering or side effects matter.",
} as const;

const MERGE = new RegExp(`^${REPO}/pulls/${NUMBER}/merge$`);
const STATUS_BY_REF = new RegExp(`^${REPO}/statuses/[^/]+$`);

export function classifyWrite(
  method: string,
  path: string,
  body: string,
): WriteClass {
  const match =
    method === "POST"
      ? QUEUEABLE.find((write) => write.pattern.test(path))
      : undefined;
  if (match?.accepts(body)) return { queueable: true };
  return { queueable: false, reason: reasonFor(method, path, match) };
}

function reasonFor(
  method: string,
  path: string,
  rejected: QueueableWrite | undefined,
): string {
  if (MERGE.test(path)) return REASONS.merge;
  if (rejected) return REASONS.review;
  if (method !== "POST") return REASONS.notPost;
  if (STATUS_BY_REF.test(path)) return REASONS.statusRef;
  return REASONS.other;
}

function isCommentReview(body: string): boolean {
  try {
    const parsed: unknown = JSON.parse(body);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "event" in parsed &&
      parsed.event === "COMMENT"
    );
  } catch {
    return false;
  }
}
