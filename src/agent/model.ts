import {
  simulateStreamingMiddleware,
  wrapLanguageModel,
  type LanguageModelMiddleware,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";

export const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Workers AI rejects an empty `tools` array, which is what the SDK sends when a
// step withdraws every tool.
const omitEmptyTools: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) =>
    params.tools?.length === 0
      ? { ...params, tools: undefined, toolChoice: undefined }
      : params,
};

// Llama 3.3 stream chunks carry both `response` and `choices[].delta`, and
// workers-ai-provider emits both, doubling text and tool arguments
// (cloudflare/ai#663). The non-streaming path is correct.
export function chatModel(ai: Ai, sessionAffinity: string) {
  const workersai = createWorkersAI({ binding: ai });
  return wrapLanguageModel({
    model: workersai(CHAT_MODEL, { sessionAffinity }),
    middleware: [simulateStreamingMiddleware(), omitEmptyTools],
  });
}
