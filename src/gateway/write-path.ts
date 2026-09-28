import { z } from "zod";
import type { SealedText } from "../security/crypto";
import { sha256Hex } from "../shared/hash";
import { authScope } from "./cache";
import type { GatewayMode } from "./guarded-upstream";
import { isUnavailable } from "./health";
import {
  fromUpstream,
  jsonError,
  queued,
  writeNotQueueable,
} from "./responses";
import type { GatewayRoute, Namespace } from "./routes";
import { toUpstreamRequest, type UpstreamResult } from "./upstream";
import { classifyWrite } from "./write-policy";
import type { QueuedWrite, WriteQueue } from "./write-queue";

export interface WriteDeps {
  now: () => number;
  newId: () => string;
  mode: () => GatewayMode;
  paused: () => boolean;
  onQueued: () => void;
  upstream: (namespace: Namespace, request: Request) => Promise<UpstreamResult>;
  sealToken: (authorization: string) => Promise<SealedText>;
}

interface PendingWrite {
  request: Request;
  route: GatewayRoute;
  body: string;
  idempotencyKey: string;
}

const IdempotencyKey = z.string().trim().min(1).max(255);

export class WritePath {
  constructor(
    private readonly queue: WriteQueue,
    private readonly deps: WriteDeps,
  ) {}

  async handle(request: Request, route: GatewayRoute): Promise<Response> {
    const body = await request.text();
    const write = classifyWrite(request.method, route.upstreamPath, body);
    if (!write.queueable) {
      if (this.deps.mode() === "degraded") {
        return writeNotQueueable(write.reason);
      }
      return fromUpstream(await this.send(request, route, body), "BYPASS");
    }
    const idempotencyKey = await keyFor(request, route, body);
    if (idempotencyKey === null) {
      return jsonError(400, "Idempotency-Key must be 1 to 255 characters");
    }
    return this.queueOrSend({ request, route, body, idempotencyKey });
  }

  private async queueOrSend(write: PendingWrite): Promise<Response> {
    const existing = this.queue.findByKey(write.idempotencyKey);
    if (existing) return this.accepted(existing);
    // Later writes must not overtake writes that are still waiting.
    if (this.deps.paused() || this.queue.hasWaiting()) {
      return this.enqueue(write);
    }
    const result = await this.send(write.request, write.route, write.body);
    if (isUnavailable(result.outcome)) return this.enqueue(write);
    return fromUpstream(result, "BYPASS");
  }

  private async enqueue(write: PendingWrite): Promise<Response> {
    const authorization = write.request.headers.get("authorization");
    const stored = this.queue.enqueue({
      id: this.deps.newId(),
      idempotencyKey: write.idempotencyKey,
      method: write.request.method,
      path: `${write.route.upstreamPath}${write.route.search}`,
      body: write.body,
      token: authorization ? await this.deps.sealToken(authorization) : null,
      now: this.deps.now(),
    });
    this.deps.onQueued();
    return this.accepted(stored);
  }

  private accepted(write: QueuedWrite): Response {
    return queued(write.id, this.queue.position(write), write.status);
  }

  private send(
    request: Request,
    route: GatewayRoute,
    body: string,
  ): Promise<UpstreamResult> {
    const withBody = new Request(request, { body: body === "" ? null : body });
    return this.deps.upstream(
      route.namespace,
      toUpstreamRequest(withBody, route),
    );
  }
}

async function keyFor(
  request: Request,
  route: GatewayRoute,
  body: string,
): Promise<string | null> {
  const scope = await authScope(request.headers.get("authorization"));
  const header = request.headers.get("idempotency-key");
  if (header === null) {
    const target = `${route.upstreamPath}${route.search}`;
    return sha256Hex(JSON.stringify([scope, request.method, target, body]));
  }
  const supplied = IdempotencyKey.safeParse(header);
  if (!supplied.success) return null;
  // Scoped by token so one caller cannot look up another caller's queued write.
  return sha256Hex(JSON.stringify([scope, "key", supplied.data]));
}
