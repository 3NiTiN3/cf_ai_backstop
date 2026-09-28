import { z } from "zod";
import { repoKeyOf } from "../gateway/routes";

export const RepoInput = z
  .string()
  .describe("Repository as owner/name, for example demo/api.");

export function parseRepo(repo: string): string | null {
  const [owner, name, ...rest] = repo.trim().split("/");
  if (owner === undefined || name === undefined || rest.length > 0) return null;
  return repoKeyOf(owner, name);
}

export function notARepo(repo: string) {
  return { error: `${repo} is not an owner/name repo` };
}
