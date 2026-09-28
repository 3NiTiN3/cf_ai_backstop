import { z } from "zod";
import { NamespaceSchema } from "../api/namespace";
import { repoKeyFromName, type Namespace } from "../gateway/routes";

export const NamespaceInput = NamespaceSchema.optional().describe(
  "live or demo. Leave it out to use the current namespace.",
);

export const RepoInput = z
  .string()
  .describe("Repository as owner/name, for example demo/api.");

const ChatBody = z.object({ namespace: NamespaceSchema.optional() });

export const parseRepo = repoKeyFromName;

export function requestedNamespace(body: unknown): Namespace | null {
  const parsed = ChatBody.safeParse(body ?? {});
  return parsed.success ? (parsed.data.namespace ?? null) : null;
}

export function notARepo(repo: string) {
  return { error: `${repo} is not an owner/name repo` };
}
