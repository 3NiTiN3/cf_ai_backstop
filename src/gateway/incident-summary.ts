import { z } from "zod";
import { CHAT_MODEL } from "../agent/model";
import { percent } from "../shared/percent";
import {
  replayProgress,
  type ClosedIncident,
  type Incident,
} from "./incidents";

export type Generate = (system: string, facts: string) => Promise<string>;

const SUMMARY_TIMEOUT_MS = 10_000;
const MAX_SUMMARY_TOKENS = 160;
const MAX_SUMMARY_CHARS = 600;

const SYSTEM = `You write incident summaries for Backstop, a gateway in front of the GitHub API.
Write 2 short plain sentences using only the facts given. Do not add causes, advice, times or numbers that are not in the facts. Do not mention writes, queues or replays; they are reported separately. Do not use em dashes, lists or headings.`;

const AiText = z.object({ response: z.string() });

export function workersAiGenerator(ai: Ai): Generate {
  return async (system, facts) => {
    const output = await ai.run(CHAT_MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: facts },
      ],
      max_tokens: MAX_SUMMARY_TOKENS,
    });
    return AiText.parse(output).response;
  };
}

export async function summarizeIncident(
  incident: ClosedIncident,
  repo: string | null,
  generate: Generate,
  timeoutMs = SUMMARY_TIMEOUT_MS,
): Promise<string> {
  try {
    const text = await withTimeout(
      generate(SYSTEM, factSheet(incident, repo)),
      timeoutMs,
    );
    return tidy(text) ?? templateSummary(incident, repo);
  } catch {
    return templateSummary(incident, repo);
  }
}

export function templateSummary(
  incident: ClosedIncident,
  repo: string | null,
): string {
  const subject = repo ?? "The repo";
  return (
    `${subject} was degraded for ${duration(incident)}, ` +
    `with a peak upstream error rate of ${percent(incident.peakErrorRate)}%. ` +
    `Backstop served ${count(incident.readsServedStale, "read")} from stale cache.`
  );
}

function factSheet(incident: ClosedIncident, repo: string | null): string {
  return [
    `Repo: ${repo ?? "unknown"}`,
    `Duration: ${duration(incident)}`,
    `Peak upstream error rate: ${percent(incident.peakErrorRate)}%`,
    `Reads served from stale cache: ${incident.readsServedStale}`,
  ].join("\n");
}

// Writes can still be credited to an incident after it closes (they queue behind the
// backlog), so their counts come from the current row, never from the stored summary.
export function withWriteStatus(incident: Incident): string | null {
  if (incident.summary === null) return null;
  const { writesQueued, writesReplayed } = incident;
  const queued = `Backstop queued ${count(writesQueued, "write")} for replay`;
  switch (replayProgress(incident)) {
    case "nothing queued":
      return incident.summary;
    case "completed":
      return writesQueued === 1
        ? `${incident.summary} ${queued}, and it has been replayed.`
        : `${incident.summary} ${queued}, and all ${writesQueued} have been replayed.`;
    case "under way":
      return `${incident.summary} ${queued}, and ${writesReplayed} of ${writesQueued} have been replayed so far.`;
  }
}

function tidy(text: string): string | null {
  const cleaned = text
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.length > MAX_SUMMARY_CHARS
    ? `${cleaned.slice(0, MAX_SUMMARY_CHARS - 3)}...`
    : cleaned;
}

function duration({ startedAt, endedAt }: ClosedIncident): string {
  const seconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  if (seconds < 120) return `${seconds} seconds`;
  return `${Math.round(seconds / 60)} minutes`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("summary timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
