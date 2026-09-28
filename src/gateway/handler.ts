import { durableObjectName, parseGatewayUrl } from "./routes";

export async function handleGatewayRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const route = parseGatewayUrl(new URL(request.url));
  if (!route) return null;
  const stub = env.RepoGateway.getByName(durableObjectName(route));
  return stub.handle(request, route);
}
