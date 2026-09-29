export interface LimitRule {
  name: string;
  periodSeconds: number;
  limiter: (env: Env) => RateLimit;
  applies: (request: Request, pathname: string) => boolean;
}

const isPost = (request: Request) => request.method === "POST";

export const LIMIT_RULES: LimitRule[] = [
  {
    name: "demo-gateway",
    periodSeconds: 10,
    limiter: (env) => env.DEMO_GATEWAY_LIMITER,
    applies: (_request, pathname) =>
      pathname === "/demo/gh" || pathname.startsWith("/demo/gh/"),
  },
  {
    name: "demo-actions",
    periodSeconds: 60,
    limiter: (env) => env.DEMO_ACTIONS_LIMITER,
    applies: (request, pathname) =>
      isPost(request) &&
      (pathname === "/api/chaos" ||
        pathname.startsWith("/api/demo/") ||
        pathname.startsWith("/api/repos/demo/")),
  },
  {
    name: "mcp",
    periodSeconds: 60,
    limiter: (env) => env.MCP_LIMITER,
    applies: (_request, pathname) => pathname === "/mcp",
  },
];

export async function limitRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const rule = LIMIT_RULES.find((candidate) =>
    candidate.applies(request, pathname),
  );
  if (!rule) return null;
  const { success } = await rule
    .limiter(env)
    .limit({ key: `${rule.name}:${clientIp(request)}` });
  return success ? null : tooManyRequests(rule.periodSeconds);
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    {
      message: "Too many requests. Please slow down and try again shortly.",
      retryAfterSeconds,
    },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}

// The public demo has no user accounts, so the client address is the only key available.
function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}
