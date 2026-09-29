import { z } from "zod";
import { REGISTRY_NAME, type Registry } from "../gateway/registry";
import { jsonError } from "../gateway/responses";
import { readJson } from "./body";

const StartTraffic = z.strictObject({
  agents: z.number().int().min(1).max(20),
  durationSeconds: z.number().int().min(10).max(180),
});

type RegistryStub = DurableObjectStub<Registry>;
type Handler = (request: Request, registry: RegistryStub) => Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/api/demo/traffic": {
    GET: async (_request, registry) =>
      Response.json(await registry.trafficStatus()),
  },
  "/api/demo/traffic/start": { POST: startTraffic },
  "/api/demo/story": {
    GET: async (_request, registry) =>
      Response.json(await registry.storyStatus()),
    POST: async (_request, registry) => {
      const started = await registry.startStory();
      return started.ok
        ? Response.json(started.status)
        : jsonError(409, "The outage story is already playing");
    },
  },
  "/api/demo/story/stop": {
    POST: async (_request, registry) =>
      Response.json(await registry.stopStory()),
  },
  "/api/demo/traffic/stop": {
    POST: async (_request, registry) =>
      Response.json(await registry.stopTraffic()),
  },
};

export function isDemoPath(pathname: string): boolean {
  return pathname.startsWith("/api/demo/");
}

export function handleDemoRequest(
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> {
  const methods = ROUTES[pathname];
  if (!methods) return Promise.resolve(jsonError(404, "Not Found"));
  const handler = methods[request.method];
  if (!handler) return Promise.resolve(jsonError(405, "Method Not Allowed"));
  return handler(request, env.Registry.getByName(REGISTRY_NAME));
}

async function startTraffic(
  request: Request,
  registry: RegistryStub,
): Promise<Response> {
  const body = await readJson(request, StartTraffic);
  if (!body.ok) return body.error;
  const started = await registry.startTraffic(
    body.data.agents,
    body.data.durationSeconds,
  );
  return started.ok
    ? Response.json(started.status)
    : jsonError(409, "Simulated traffic is already running");
}
