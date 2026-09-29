import { durableObjectName, parseGatewayUrl } from "../gateway/routes";
import type { PlannedRequest } from "./traffic-plan";

const DEMO_ORIGIN = "https://demo.backstop.internal";

export async function sendToGateway(
  env: Env,
  planned: PlannedRequest,
): Promise<void> {
  const request = new Request(`${DEMO_ORIGIN}/demo/gh${planned.path}`, {
    method: planned.method,
    headers: planned.headers,
    body: planned.body,
  });
  const route = parseGatewayUrl(new URL(request.url));
  if (!route) return;
  const response = await env.RepoGateway.getByName(
    durableObjectName(route),
  ).handle(request, route);
  await response.body?.cancel();
}
