import { z } from "zod";
import { repoKeyFromName } from "../gateway/routes";

export const RepoInput = z
  .string()
  .describe("Repository as owner/name, for example demo/api.");

export const parseRepo = repoKeyFromName;

export function notARepo(repo: string) {
  return { error: `${repo} is not an owner/name repo` };
}
