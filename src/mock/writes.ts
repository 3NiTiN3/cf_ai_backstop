import { z } from "zod";
import { MOCK_OWNER, fakeId, labelObject, type RepoSpec } from "./fixtures";
import { githubError, jsonResponse } from "./http";
import { issueObjects } from "./resources";

const DEMO_USER = {
  login: "backstop-demo",
  id: fakeId("backstop-demo"),
  type: "User",
};

const IssueInput = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

const CommentInput = z.object({ body: z.string().min(1) });

const LabelsInput = z.union([
  z.array(z.string()),
  z.object({ labels: z.array(z.string()) }),
]);

const StatusInput = z.object({
  state: z.enum(["error", "failure", "pending", "success"]),
  target_url: z.string().optional(),
  description: z.string().optional(),
  context: z.string().optional(),
});

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: githubError(400, "Problems parsing JSON") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: githubError(422, "Validation Failed") };
  }
  return { ok: true, data: result.data };
}

function now(): string {
  return new Date().toISOString();
}

export async function createIssue(spec: RepoSpec, request: Request) {
  const input = await parseBody(request, IssueInput);
  if (!input.ok) return input.response;
  const seed = `${spec.name}:issue:${JSON.stringify(input.data)}`;
  const issue = {
    id: fakeId(seed),
    number: 1000 + (fakeId(seed) % 9000),
    state: "open",
    title: input.data.title,
    body: input.data.body ?? null,
    user: DEMO_USER,
    labels: (input.data.labels ?? []).map(labelObject),
    comments: 0,
    created_at: now(),
    updated_at: now(),
  };
  return jsonResponse(issue, 201);
}

export async function createComment(
  spec: RepoSpec,
  issueNumber: number,
  request: Request,
) {
  const input = await parseBody(request, CommentInput);
  if (!input.ok) return input.response;
  const comment = {
    id: fakeId(`${spec.name}:comment:${issueNumber}:${input.data.body}`),
    body: input.data.body,
    user: DEMO_USER,
    issue_number: issueNumber,
    created_at: now(),
    updated_at: now(),
  };
  return jsonResponse(comment, 201);
}

export async function addLabels(
  spec: RepoSpec,
  issueNumber: number,
  request: Request,
) {
  const input = await parseBody(request, LabelsInput);
  if (!input.ok) return input.response;
  const added = Array.isArray(input.data) ? input.data : input.data.labels;
  const existing =
    issueObjects(spec, "all").find((issue) => issue.number === issueNumber)
      ?.labels ?? [];
  const names = new Set([...existing.map((label) => label.name), ...added]);
  return jsonResponse([...names].map(labelObject), 200);
}

export async function createStatus(
  spec: RepoSpec,
  sha: string,
  request: Request,
) {
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    return githubError(422, `No commit found for SHA: ${sha}`);
  }
  const input = await parseBody(request, StatusInput);
  if (!input.ok) return input.response;
  const status = {
    id: fakeId(`${MOCK_OWNER}/${spec.name}:status:${sha}:${input.data.state}`),
    state: input.data.state,
    context: input.data.context ?? "default",
    description: input.data.description ?? null,
    target_url: input.data.target_url ?? null,
    creator: DEMO_USER,
    created_at: now(),
    updated_at: now(),
  };
  return jsonResponse(status, 201);
}
