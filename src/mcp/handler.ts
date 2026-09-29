import { createMcpHandler } from "agents/mcp";
import { createBackstopServer } from "./server";
import { TOKEN_HEADER } from "./tools";

export const MCP_PATH = "/mcp";

export function handleMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> | null {
  if (new URL(request.url).pathname !== MCP_PATH) return null;
  const token = request.headers.get(TOKEN_HEADER)?.trim() || null;
  const server = createBackstopServer({ env, token });
  return createMcpHandler(server, { route: MCP_PATH })(request, env, ctx);
}
