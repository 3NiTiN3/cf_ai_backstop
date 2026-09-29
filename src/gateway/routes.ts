export type Namespace = "live" | "demo";

const GLOBAL_REPO_KEY = "_global";

export interface GatewayRoute {
  namespace: Namespace;
  upstreamPath: string;
  search: string;
  repoKey: string;
}

const PREFIXES: ReadonlyArray<readonly [string, Namespace]> = [
  ["/demo/gh", "demo"],
  ["/gh", "live"],
];

const GITHUB_NAME = /^[A-Za-z0-9_.-]+$/;

export function parseGatewayUrl(url: URL): GatewayRoute | null {
  for (const [prefix, namespace] of PREFIXES) {
    const upstreamPath = stripPrefix(url.pathname, prefix);
    if (upstreamPath === null) continue;
    return {
      namespace,
      upstreamPath,
      search: url.search,
      repoKey: repoKeyFor(upstreamPath),
    };
  }
  return null;
}

export function durableObjectName(
  route: Pick<GatewayRoute, "namespace" | "repoKey">,
): string {
  return `${route.namespace}:${route.repoKey}`;
}

function stripPrefix(pathname: string, prefix: string): string | null {
  if (pathname === prefix) return "/";
  if (!pathname.startsWith(`${prefix}/`)) return null;
  return pathname.slice(prefix.length);
}

function repoKeyFor(upstreamPath: string): string {
  const [, first, owner, repo] = upstreamPath.split("/");
  if (first !== "repos" || owner === undefined || repo === undefined) {
    return GLOBAL_REPO_KEY;
  }
  return repoKeyOf(owner, repo) ?? GLOBAL_REPO_KEY;
}

export function repoKeyOf(owner: string, repo: string): string | null {
  const decodedOwner = safeDecode(owner);
  const decodedRepo = safeDecode(repo);
  if (!isGitHubName(decodedOwner) || !isGitHubName(decodedRepo)) return null;
  return `${decodedOwner}/${decodedRepo}`.toLowerCase();
}

export function repoKeyFromName(name: string): string | null {
  const [owner, repo, ...rest] = name.trim().split("/");
  if (owner === undefined || repo === undefined || rest.length > 0) return null;
  return repoKeyOf(owner, repo);
}

function isGitHubName(value: string | null): value is string {
  return value !== null && GITHUB_NAME.test(value) && !/^\.+$/.test(value);
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
