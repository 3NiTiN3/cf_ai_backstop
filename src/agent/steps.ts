const MAX_TOOL_STEPS = 3;

interface StepCalls {
  toolCalls: ReadonlyArray<{ toolName: string; input: unknown }>;
}

// Llama 3.3 on Workers AI tends to call the same tool again instead of answering,
// so tools are withdrawn once a call repeats or the step budget is spent.
export function answerAfterTools({ steps }: { steps: readonly StepCalls[] }) {
  const calls = steps.flatMap((step) =>
    step.toolCalls.map(
      (call) => `${call.toolName}:${JSON.stringify(call.input)}`,
    ),
  );
  const repeated = new Set(calls).size < calls.length;
  if (repeated || steps.length >= MAX_TOOL_STEPS) return { activeTools: [] };
  return undefined;
}
