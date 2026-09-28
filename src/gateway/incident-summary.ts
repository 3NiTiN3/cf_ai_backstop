import { z } from "zod";
import { CHAT_MODEL } from "../agent/model";
import type { ClosedIncident } from "./incidents";

export type Generate = (system: string, facts: string) => Promise<string>;

const SUMMARY_TIMEOUT_MS = 10_000;
const MAX_SUMMARY_TOKENS = 160;
const MAX_SUMMARY_CHARS = 600;

const SYSTEM = `You write incident summaries for Backstop, a gateway in front of the GitHub API.
Write 2 or 3 short plain sentences using only the facts given. Do not add causes, advice or numbers that are not in the facts. Do not use em dashes, lists or headings.`;

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
    `${subject} was degraded for ${duration(incident)} from ${clock(incident.startedAt)} UTC, ` +
    `with a peak upstream error rate of ${percent(incident.peakErrorRate)}. ` +
    `Backstop served ${incident.readsServedStale} stale reads and queued ${incident.writesQueued} writes for replay.`
  );
}

function factSheet(incident: ClosedIncident, repo: string | null): string {
  return [
    `Repo: ${repo ?? "unknown"}`,
    `Started: ${clock(incident.startedAt)} UTC`,
    `Ended: ${clock(incident.endedAt)} UTC`,
    `Duration: ${duration(incident)}`,
    `Peak upstream error rate: ${percent(incident.peakErrorRate)}`,
    `Reads served from stale cache: ${incident.readsServedStale}`,
    `Writes queued for replay: ${incident.writesQueued}`,
    `Queued writes are replayed in order now that GitHub has recovered.`,
  ].join("\n");
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

function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("summary timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
