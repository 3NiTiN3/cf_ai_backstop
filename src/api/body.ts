import type { z } from "zod";
import { jsonError } from "../gateway/responses";
import { declaredTooLarge, readTextLimited } from "../shared/read-limited";

export const MAX_BODY_BYTES = 16 * 1024;

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: Response };

export function bodyTooLarge(request: Request): Response | null {
  return declaredTooLarge(request, MAX_BODY_BYTES) ? tooLarge() : null;
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<Parsed<T>> {
  const text = await readTextLimited(request, MAX_BODY_BYTES);
  if (text === null) return { ok: false, error: tooLarge() };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: jsonError(400, "Body must be valid JSON") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: jsonError(400, describeIssues(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path === "" ? issue.message : `${path}: ${issue.message}`;
    })
    .join("; ");
}

function tooLarge(): Response {
  return jsonError(413, `Body must be at most ${MAX_BODY_BYTES} bytes`);
}
