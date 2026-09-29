import { jsonError } from "./responses";

export const MAX_WRITE_BODY_BYTES = 512 * 1024;

export function writeTooLarge(): Response {
  return jsonError(
    413,
    `Write bodies must be at most ${MAX_WRITE_BODY_BYTES} bytes`,
  );
}
