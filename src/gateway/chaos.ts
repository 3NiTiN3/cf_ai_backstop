import type { Namespace } from "./routes";
import type { UpstreamResult } from "./upstream";

export const CHAOS_MODES = ["off", "errors", "latency", "blackout"] as const;

type ChaosMode = (typeof CHAOS_MODES)[number];

export interface ChaosConfig {
  mode: ChaosMode;
  errorRate: number;
  latencyMs: number;
}

export const CHAOS_OFF: ChaosConfig = {
  mode: "off",
  errorRate: 0,
  latencyMs: 0,
};

export interface ChaosDeps {
  random: () => number;
  sleep: (ms: number) => Promise<void>;
}

const CACHE_MS = 2000;

export async function applyChaos(
  config: ChaosConfig,
  call: () => Promise<UpstreamResult>,
  deps: ChaosDeps,
): Promise<UpstreamResult> {
  switch (config.mode) {
    case "off":
      return call();
    case "blackout":
      return injected("network_error");
    case "errors":
      return deps.random() < config.errorRate
        ? injected("server_error")
        : call();
    case "latency": {
      await deps.sleep(config.latencyMs);
      const result = await call();
      return { ...result, latencyMs: result.latencyMs + config.latencyMs };
    }
  }
}

export class CachedChaos {
  private readonly entries = new Map<
    Namespace,
    { config: ChaosConfig; loadedAt: number }
  >();

  constructor(
    private readonly load: (namespace: Namespace) => Promise<ChaosConfig>,
    private readonly now: () => number,
  ) {}

  async get(namespace: Namespace): Promise<ChaosConfig> {
    const entry = this.entries.get(namespace);
    if (entry && this.now() - entry.loadedAt < CACHE_MS) return entry.config;
    const config = await this.load(namespace).catch(() => CHAOS_OFF);
    this.entries.set(namespace, { config, loadedAt: this.now() });
    return config;
  }
}

function injected(outcome: "server_error" | "network_error"): UpstreamResult {
  const serverError = outcome === "server_error";
  return {
    status: 502,
    headers: serverError ? { "content-type": "application/json" } : {},
    body: serverError
      ? JSON.stringify({ message: "Injected by Backstop chaos" })
      : "",
    etag: null,
    lastModified: null,
    latencyMs: 0,
    outcome,
  };
}
