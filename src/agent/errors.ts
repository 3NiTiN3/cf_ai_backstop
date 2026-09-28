const QUOTA_PATTERN = /\b4006\b|daily free allocation/i;

export const QUOTA_MESSAGE =
  "The Workers AI daily allowance for this demo is used up, so the chat cannot answer right now. It resets at 00:00 UTC. The dashboard keeps working.";

export const GENERIC_MESSAGE =
  "The model did not answer. Please try again in a moment.";

export function chatErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return QUOTA_PATTERN.test(text) ? QUOTA_MESSAGE : GENERIC_MESSAGE;
}
