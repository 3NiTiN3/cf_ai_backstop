import { DurableObject } from "cloudflare:workers";
import { jsonError } from "./responses";
import type { GatewayRoute } from "./routes";

export class RepoGateway extends DurableObject<Env> {
  async handle(_request: Request, _route: GatewayRoute): Promise<Response> {
    return jsonError(501, "Upstream is not connected yet");
  }
}
