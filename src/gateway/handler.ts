import { declaredTooLarge } from "../shared/read-limited";
import { jsonError } from "./responses";
import { durableObjectName, parseGatewayUrl } from "./routes";
import { MAX_WRITE_BODY_BYTES, writeTooLarge } from "./write-limits";

// GitHub no longer accepts these, and a credential in the query string would
// land in the public cache scope and in event paths.
const QUERY_CREDENTIALS = ["access_token", "client_secret"];

export async function handleGatewayRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const route = parseGatewayUrl(url);
  if (!route) return null;
  if (QUERY_CREDENTIALS.some((name) => url.searchParams.has(name))) {
    return jsonError(
      400,
      "Send the GitHub token in the Authorization header, not the query string",
    );
  }
  if (declaredTooLarge(request, MAX_WRITE_BODY_BYTES)) {
    return writeTooLarge();
  }
  const stub = env.RepoGateway.getByName(durableObjectName(route));
  return stub.handle(request, route);
}
