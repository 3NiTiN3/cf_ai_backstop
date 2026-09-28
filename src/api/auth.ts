const BEARER = /^Bearer\s+(.+)$/i;

export async function isAdmin(
  request: Request,
  adminToken: string | undefined,
): Promise<boolean> {
  if (!adminToken) return false;
  const match = BEARER.exec(request.headers.get("authorization") ?? "");
  const presented = match?.[1];
  if (presented === undefined) return false;
  const [a, b] = await Promise.all([digest(presented), digest(adminToken)]);
  return constantTimeEqual(a, b);
}

async function digest(value: string): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(hash);
}

// Digests have a fixed length, so this loop runs the same number of steps whatever the token is.
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}
