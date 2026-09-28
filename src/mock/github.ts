import { findRepo, type RepoSpec } from "./fixtures";
import { githubError, jsonWithEtag } from "./http";
import {
  combinedStatus,
  commitObjects,
  contentObject,
  findPull,
  issueObjects,
  pullObjects,
  repoObject,
  type ListState,
} from "./resources";
import { addLabels, createComment, createIssue, createStatus } from "./writes";

export interface MockOptions {
  latencyMs?: () => number;
}

interface RouteContext {
  spec: RepoSpec;
  request: Request;
  params: string[];
  query: URLSearchParams;
}

type Route = [
  method: string,
  pattern: RegExp,
  handler: (ctx: RouteContext) => Promise<Response>,
];

const REPO_PATH = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/;

const ROUTES: Route[] = [
  ["GET", /^$/, (c) => found(c, repoObject(c.spec))],
  [
    "GET",
    /^\/contents(?:\/(.*))?$/,
    (c) => found(c, contentObject(c.spec, param(c, 0))),
  ],
  [
    "GET",
    /^\/pulls$/,
    (c) => found(c, page(c, pullObjects(c.spec, listState(c)))),
  ],
  [
    "GET",
    /^\/pulls\/(\d+)$/,
    (c) => found(c, findPull(c.spec, Number(param(c, 0)))),
  ],
  [
    "GET",
    /^\/issues$/,
    (c) => found(c, page(c, issueObjects(c.spec, listState(c)))),
  ],
  ["GET", /^\/commits$/, (c) => found(c, page(c, commitObjects(c.spec)))],
  [
    "GET",
    /^\/commits\/([^/]+)\/status$/,
    (c) => found(c, combinedStatus(c.spec, param(c, 0))),
  ],
  ["POST", /^\/issues$/, (c) => createIssue(c.spec, c.request)],
  [
    "POST",
    /^\/issues\/(\d+)\/comments$/,
    (c) => createComment(c.spec, Number(param(c, 0)), c.request),
  ],
  [
    "POST",
    /^\/issues\/(\d+)\/labels$/,
    (c) => addLabels(c.spec, Number(param(c, 0)), c.request),
  ],
  [
    "POST",
    /^\/statuses\/([^/]+)$/,
    (c) => createStatus(c.spec, param(c, 0), c.request),
  ],
];

export async function handleMockRequest(
  request: Request,
  options: MockOptions = {},
): Promise<Response> {
  await delay((options.latencyMs ?? randomLatency)());
  const url = new URL(request.url);
  const match = REPO_PATH.exec(url.pathname.replace(/(.)\/$/, "$1"));
  const spec = match && findRepo(safeDecode(match[1]), safeDecode(match[2]));
  if (!match || !spec) return githubError(404, "Not Found");

  const rest = match[3] ?? "";
  for (const [method, pattern, handler] of ROUTES) {
    const params = pattern.exec(rest);
    if (request.method !== method || !params) continue;
    return handler({
      spec,
      request,
      params: params.slice(1).map(safeDecode),
      query: url.searchParams,
    });
  }
  return githubError(404, "Not Found");
}

function found(ctx: RouteContext, value: unknown): Promise<Response> {
  if (value === undefined)
    return Promise.resolve(githubError(404, "Not Found"));
  return jsonWithEtag(ctx.request, value);
}

function param(ctx: RouteContext, index: number): string {
  return ctx.params[index] ?? "";
}

function listState(ctx: RouteContext): ListState {
  const state = ctx.query.get("state");
  return state === "closed" || state === "all" ? state : "open";
}

function page<T>(ctx: RouteContext, items: T[]): T[] {
  const perPage = clamp(Number(ctx.query.get("per_page") ?? 30), 1, 100);
  const pageNumber = clamp(Number(ctx.query.get("page") ?? 1), 1, 1000);
  return items.slice((pageNumber - 1) * perPage, pageNumber * perPage);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function safeDecode(segment: string | undefined): string {
  try {
    return decodeURIComponent(segment ?? "");
  } catch {
    return "";
  }
}

function randomLatency(): number {
  return 40 + Math.floor(Math.random() * 111);
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
