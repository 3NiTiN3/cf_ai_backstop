import { z } from "zod";
import { NamespaceSchema } from "../api/namespace";
import { repoKeyFromName } from "../gateway/routes";

export const NamespaceInput = NamespaceSchema.optional().describe(
  "live or demo. Leave it out to use the current namespace.",
);

export const RepoInput = z
  .string()
  .describe("Repository as owner/name, for example demo/api.");

export const parseRepo = repoKeyFromName;

export function notARepo(repo: string) {
  return { error: `${repo} is not an owner/name repo` };
}
