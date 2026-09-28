import type { SealedText } from "../security/crypto";
import { isUnavailable } from "./health";
import type { Namespace } from "./routes";
import { githubRequest, type UpstreamResult } from "./upstream";
import type { QueuedWrite, WriteQueue } from "./write-queue";

export type SendOutcome =
  | { kind: "done"; status: number }
  | { kind: "failed"; error: string }
  | { kind: "retry"; error: string }
  | { kind: "skipped" };

export type SettleDecision = "continue" | "stop";

export interface ReplayDeps {
  now: () => number;
  upstream: (namespace: Namespace, request: Request) => Promise<UpstreamResult>;
  unsealToken: (sealed: SealedText) => Promise<string>;
  onSent: (write: QueuedWrite, result: UpstreamResult) => void;
}

const BATCH_SIZE = 10;
const MAX_ERROR_LENGTH = 200;

export class QueueReplayer {
  constructor(
    private readonly queue: WriteQueue,
    private readonly deps: ReplayDeps,
  ) {}

  claimBatch(): string[] {
    return this.queue.claim(BATCH_SIZE, this.deps.now());
  }

  async send(namespace: Namespace, id: string): Promise<SendOutcome> {
    const write = this.queue.get(id);
    if (write?.status !== "in_flight") return { kind: "skipped" };
    const request = await this.requestFor(write);
    if (request === null) {
      return this.fail(id, null, "The stored token could not be decrypted");
    }
    const result = await this.deps.upstream(namespace, request);
    this.deps.onSent(write, result);
    if (isUnavailable(result.outcome)) {
      const error = `${result.outcome} (${result.status})`;
      this.queue.noteAttempt(id, error, this.deps.now());
      return { kind: "retry", error };
    }
    if (result.status >= 400) {
      return this.fail(id, result.status, errorText(result));
    }
    this.queue.markDone(id, result.status, this.deps.now());
    return { kind: "done", status: result.status };
  }

  settle(id: string): SettleDecision {
    const status = this.queue.get(id)?.status;
    if (status === "pending" || status === "in_flight") {
      this.queue.releaseInFlight(this.deps.now());
      return "stop";
    }
    return "continue";
  }

  private fail(id: string, status: number | null, error: string): SendOutcome {
    this.queue.markFailed(id, status, error, this.deps.now());
    return { kind: "failed", error };
  }

  private async requestFor(write: QueuedWrite): Promise<Request | null> {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    };
    const sealed = this.queue.sealedToken(write.id);
    if (sealed) {
      try {
        headers.authorization = await this.deps.unsealToken(sealed);
      } catch {
        return null;
      }
    }
    return githubRequest(write.method, write.path, headers, write.body || null);
  }
}

function errorText(result: UpstreamResult): string {
  const message = messageOf(result.body);
  const text = message
    ? `GitHub answered ${result.status}: ${message}`
    : `GitHub answered ${result.status}`;
  return text.slice(0, MAX_ERROR_LENGTH);
}

function messageOf(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!("message" in parsed) || typeof parsed.message !== "string") {
      return null;
    }
    return parsed.message;
  } catch {
    return null;
  }
}
