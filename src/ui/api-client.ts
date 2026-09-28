import { z } from "zod";

const ErrorBody = z.object({ message: z.string() });

export async function getJson<T>(
  url: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw await failure(response);
  return schema.parse(await response.json());
}

export async function postJson(
  url: string,
  body: unknown,
  adminToken: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (adminToken) headers.authorization = `Bearer ${adminToken}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await failure(response);
  await response.body?.cancel();
}

async function failure(response: Response): Promise<Error> {
  const parsed = ErrorBody.safeParse(await response.json().catch(() => null));
  return new Error(
    parsed.success
      ? parsed.data.message
      : `Request failed with status ${response.status}`,
  );
}
