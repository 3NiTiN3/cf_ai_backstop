import type { z } from "zod";
import { jsonError } from "../gateway/responses";

export const MAX_BODY_BYTES = 16 * 1024;

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: Response };

export function bodyTooLarge(request: Request): Response | null {
  const declared = Number(request.headers.get("content-length") ?? 0);
  return declared > MAX_BODY_BYTES ? tooLarge() : null;
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<Parsed<T>> {
  const text = await readLimited(request);
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

// Content-Length can be missing or wrong on chunked uploads, so the stream is capped as it is read.
async function readLimited(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function tooLarge(): Response {
  return jsonError(413, `Body must be at most ${MAX_BODY_BYTES} bytes`);
}
