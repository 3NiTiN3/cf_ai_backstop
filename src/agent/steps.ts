interface StepCalls {
  toolCalls: ReadonlyArray<unknown>;
}

// Llama 3.3 on Workers AI keeps calling tools instead of answering, so tools
// are withdrawn after the first step that calls any and the model must answer.
export function answerAfterTools({ steps }: { steps: readonly StepCalls[] }) {
  const calledTools = steps.some((step) => step.toolCalls.length > 0);
  return calledTools ? { activeTools: [] } : undefined;
}
