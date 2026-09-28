import { generateText, type ToolSet } from "ai";
import { chatModel } from "./model";
import { buildSystemPrompt } from "./prompt";
import { INITIAL_OPS_STATE } from "./state";
import { createAgentTools } from "./toolset";

export interface ChosenCall {
  toolName: string;
  input: unknown;
}

export interface EvalTurn {
  toolCalls: ChosenCall[];
  text: string;
}

export function dryRun(tools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => [
      name,
      { ...definition, execute: undefined, needsApproval: undefined },
    ]),
  );
}

export async function runEvalTurn(
  env: Env,
  question: string,
): Promise<EvalTurn> {
  const state = INITIAL_OPS_STATE;
  const tools = createAgentTools({ env, state: () => state, save: () => {} });
  const result = await generateText({
    model: chatModel(env.AI, "eval"),
    system: buildSystemPrompt(state),
    messages: [{ role: "user", content: question }],
    tools: dryRun(tools),
  });
  return {
    toolCalls: result.toolCalls.map(({ toolName, input }) => ({
      toolName,
      input,
    })),
    text: result.text,
  };
}
